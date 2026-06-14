#!/usr/bin/env bun

/**
 * CLI entry point for Fermi.
 *
 * Usage:
 *
 *   fermi                       # auto-detect config
 *   fermi init                  # run initialization wizard
 *   fermi --templates ./tpls    # explicit templates path
 *   fermi --verbose             # enable debug logging
 */

import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

import {
  fixStorage,
  loadGlobalSettings,
  parseSettingsOverrides,
  settingsToConfigInputs,
} from "./persistence.js";
import { loadDotenv } from "./dotenv.js";
import { getFermiHomeDir } from "./home-path.js";
import { startBackgroundRegistryRefresh } from "./registry-fetch.js";
import { checkForUpdates, applyStaged, setUpdateStateGetter, setRelaunchCallback } from "./update-check.js";
import { VERSION } from "./version.js";
import { hasAnyManagedCredential } from "./managed-provider-credentials.js";
import { findSessionById } from "./session-resume.js";

export interface MainDeps {
  launchTui?: () => Promise<void>;
  homeDir?: string;
  loadDotenv?: (homeDir?: string) => void;
  loadGlobalSettings?: typeof loadGlobalSettings;
  applyStaged?: typeof applyStaged;
  checkForUpdates?: typeof checkForUpdates;
  relaunchAfterUpdate?: (argv: string[]) => void;
  runInitWizard?: () => Promise<unknown>;
  runServerMode?: (opts: {
    workDir: string;
    sessionId?: string;
    selectedModel?: string;
    selectedAgent?: string;
    templates?: string;
    configOverrides?: readonly string[];
  }) => Promise<void>;
  findSessionById?: typeof findSessionById;
  hasAnyManagedCredential?: typeof hasAnyManagedCredential;
  hasGitHubTokens?: () => boolean;
}

const VALUE_FLAGS = new Set([
  "--resume",
  "--templates",
  "--config",
  "-c",
  "--work-dir",
  "--session-id",
  "--model",
  "--agent",
]);

function relaunchCurrentBinary(argv: string[]): void {
  const relaunchArgs = argv.length > 0 && argv[0] === process.execPath
    ? argv.slice(1)
    : argv.slice(2);
  const result = spawnSync(process.execPath, relaunchArgs, {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

/**
 * Handle `fermi --resume <id>` before Commander parses argv.
 *
 * Looks the session up across all projects in the Fermi home. If it lives
 * under a different cwd, prompts the user to switch (Y) or quit (N). On
 * success, stashes the resolved session dir in an env var so that
 * `launchTui()` can call `applySessionRestore` after bootstrap. The flag and
 * its argument are spliced out of argv so Commander never sees them.
 */
async function maybeHandleResumeFlag(
  argv: string[],
  findSession: typeof findSessionById = findSessionById,
): Promise<void> {
  const idx = argv.indexOf("--resume");
  if (idx < 0) return;

  const id = argv[idx + 1];
  if (!id || id.startsWith("--")) {
    console.error("Error: --resume requires a session ID.");
    console.error("Usage: fermi --resume <sessionId>");
    process.exit(1);
  }

  const found = findSession(id);
  if (!found) {
    console.error(`Error: session not found: ${id}`);
    process.exit(1);
  }

  const cwd = process.cwd();
  if (found.projectPath && found.projectPath !== cwd) {
    let willCd: boolean;
    try {
      const { confirm } = await import("@inquirer/prompts");
      willCd = await confirm({
        message: `This session lives in ${found.projectPath}.\n  Switch to that directory and resume?`,
        default: true,
      });
    } catch {
      process.exit(130); // user Ctrl+C
    }
    if (!willCd) process.exit(0);
    try {
      process.chdir(found.projectPath);
    } catch (e) {
      console.error(`Error: failed to chdir to ${found.projectPath}: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  process.env["FERMI_RESUME_SESSION_DIR"] = found.sessionDir;
  argv.splice(idx, 2);
}

// Validate -c overrides up front and exit with a friendly message on bad
// input — `parseSettingsOverrides` throws raw Errors, which bubble up as
// stack traces if uncaught.
function parseConfigOverridesOrExit(overrides: readonly string[]) {
  try {
    return parseSettingsOverrides(overrides);
  } catch (err) {
    process.stderr.write(`fermi: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}

function normalizeLegacyVersionAlias(argv: string[]): void {
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] !== "-v") continue;
    if (VALUE_FLAGS.has(argv[index - 1] ?? "")) continue;
    argv[index] = "-V";
  }
}

function hasConfiguredProviders(
  settings: ReturnType<typeof loadGlobalSettings>,
  hasManagedCredential: typeof hasAnyManagedCredential = hasAnyManagedCredential,
): boolean {
  const { providerEnvVars, localProviders } = settingsToConfigInputs(settings);
  return (
    Object.keys(providerEnvVars).length > 0
    || Object.keys(localProviders).length > 0
    || hasManagedCredential()
  );
}

async function ensureProvidersConfigured(
  homeDir: string,
  deps: Pick<MainDeps, "loadGlobalSettings" | "runInitWizard" | "hasAnyManagedCredential">,
): Promise<ReturnType<typeof loadGlobalSettings>> {
  const loadSettings = deps.loadGlobalSettings ?? loadGlobalSettings;
  const hasManagedCredential = deps.hasAnyManagedCredential ?? hasAnyManagedCredential;
  let globalSettings = loadSettings(homeDir);
  if (hasConfiguredProviders(globalSettings, hasManagedCredential)) return globalSettings;

  console.log("No providers configured. Starting setup wizard...\n");
  try {
    const runInitWizard = deps.runInitWizard ?? (await import("./init-wizard.js")).runInitWizard;
    await runInitWizard();
  } catch {
    console.error(
      "Error: no providers configured.\n" +
      "  Run 'fermi init' to set up providers.",
    );
    process.exit(1);
  }

  globalSettings = loadSettings(homeDir);
  if (!hasConfiguredProviders(globalSettings, hasManagedCredential)) {
    console.error(
      "Error: no providers configured.\n" +
      "  Run 'fermi init' to set up providers.",
    );
    process.exit(1);
  }
  return globalSettings;
}

async function warnIfCopilotCredentialsMissing(
  settings: ReturnType<typeof loadGlobalSettings>,
  hasGitHubTokensOverride?: () => boolean,
): Promise<void> {
  const { providerEnvVars } = settingsToConfigInputs(settings);
  if (!Object.prototype.hasOwnProperty.call(providerEnvVars, "copilot")) return;

  const hasGitHubTokens = hasGitHubTokensOverride
    ?? (await import("./auth/github-copilot-oauth.js")).hasGitHubTokens;
  if (!hasGitHubTokens()) {
    console.warn("Warning: GitHub Copilot credentials missing.");
    console.warn("Run 'fermi oauth' to log in.\n");
  }
}

async function launchTuiFromDefaultEntry(): Promise<void> {
  // Dynamic path to keep opentui-src out of src/'s rootDir typecheck scope.
  // At runtime, tsx/bun/node resolves this relative to the current file.
  const opentuiEntry = "../opentui-src/main.js";
  const mod = (await import(opentuiEntry)) as { launchTui: () => Promise<void> };
  await mod.launchTui();
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

export async function main(argv: string[] = process.argv, deps: MainDeps = {}): Promise<void> {
  normalizeLegacyVersionAlias(argv);

  const homeDir = deps.homeDir ?? getFermiHomeDir();

  // ── --resume <id> short-circuit ──
  // Locate the session globally; if it lives under a different project, ask
  // before chdir'ing. Has to run before Commander parses the rest of argv,
  // so the session-resolved cwd is in effect for everything below.
  await maybeHandleResumeFlag(argv, deps.findSessionById);

  // Server mode short-circuit — bypass commander/TUI entirely.
  // The GUI (Electron main process) spawns this with `--server --work-dir <path>`.
  if (argv.includes("--server")) {
    const args = argv.slice(2);
    const getFlag = (name: string): string | undefined => {
      const idx = args.indexOf(name);
      return idx >= 0 ? args[idx + 1] : undefined;
    };
    const workDir = getFlag("--work-dir") ?? process.cwd();
    const sessionId = getFlag("--session-id");
    const selectedModel = getFlag("--model");
    const selectedAgent = getFlag("--agent");
    const templates = getFlag("--templates");
    const configOverrides: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      if ((args[i] === "--config" || args[i] === "-c") && args[i + 1]) {
        configOverrides.push(args[i + 1]!);
        i += 1;
      }
    }
    // Validate now so a bad override fails with a clean message instead of
    // surfacing as a fatal stack trace from inside the server bootstrap.
    parseConfigOverridesOrExit(configOverrides);
    const runServerMode = deps.runServerMode ?? (await import("./server/server-mode.js")).runServerMode;
    try {
      await runServerMode({ workDir, sessionId, selectedModel, selectedAgent, templates, configOverrides });
    } catch (err) {
      process.stderr.write(
        `[fermi --server] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
      );
      process.exit(1);
    }
    return;
  }

  const program = new Command();
  program
    .name("fermi")
    .version(VERSION, "-V, --version", "Output the current version")
    .description("A terminal AI coding agent built for long sessions")
    .option("--templates <path>", "Path to agent_templates directory")
    .option("-c, --config <key=value>", "Override a setting for this process", (value, previous: string[]) => {
      previous.push(value);
      return previous;
    }, [])
    .option("--verbose", "Enable debug logging");

  // Subcommands
  let ranSubcommand = false;
  program
    .command("init")
    .description("Initialize Fermi configuration")
    .action(async () => {
      ranSubcommand = true;
      const runInitWizard = deps.runInitWizard ?? (await import("./init-wizard.js")).runInitWizard;
      await runInitWizard();
    });

  program
    .command("oauth [action] [service]")
    .description("Manage OAuth login for Codex or Copilot (login/status/logout)")
    .action(async (action?: string, service?: string) => {
      ranSubcommand = true;
      const { oauthCommand } = await import("./auth/openai-oauth.js");
      await oauthCommand(action, service);
    });

  program
    .command("fix")
    .description("Check and repair session storage (missing project.json / meta.json)")
    .action(() => {
      ranSubcommand = true;
      console.log("Checking session storage...\n");
      const result = fixStorage();
      console.log(`Projects checked: ${result.projectsChecked}`);
      console.log(`Projects fixed:   ${result.projectsFixed}`);
      console.log(`Sessions checked: ${result.sessionsChecked}`);
      console.log(`Sessions fixed:   ${result.sessionsFixed}`);
      if (result.warnings.length > 0) {
        console.log(`\nWarnings:`);
        for (const w of result.warnings) {
          console.log(`  - ${w}`);
        }
      }
      if (result.projectsFixed === 0 && result.sessionsFixed === 0) {
        console.log("\nAll good — no repairs needed.");
      } else {
        console.log(`\nDone — repaired ${result.projectsFixed + result.sessionsFixed} items.`);
      }
    });

  program
    .command("sessions")
    .description("List saved sessions for a project directory")
    .option("--json", "Output as JSON")
    .option("--work-dir <path>", "Project directory (defaults to cwd)")
    .action(async (opts: { json?: boolean; workDir?: string }) => {
      ranSubcommand = true;
      const { SessionStore } = await import("./persistence.js");
      const projectPath = opts.workDir ? resolve(opts.workDir) : process.cwd();
      const store = new SessionStore({ projectPath });
      const sessions = store.listSessions();
      if (opts.json) {
        process.stdout.write(JSON.stringify(sessions) + "\n");
      } else {
        for (const s of sessions) {
          console.log(`${s.sessionId}  ${s.title || s.summary || "(untitled)"}  (${s.turns} turns)`);
        }
      }
    });

  program
    .command("update")
    .description("Check for and install the latest version")
    .option("--check", "Check for updates without installing")
    .action(async (opts: { check?: boolean }) => {
      ranSubcommand = true;
      if (opts.check) {
        const { runUpdateCheck } = await import("./update-check.js");
        await runUpdateCheck(VERSION);
      } else {
        const { runUpdate } = await import("./update-check.js");
        await runUpdate(VERSION);
      }
    });

  // Default action — prevents Commander from showing help and exiting
  // when no subcommand is provided.
  program.action(() => {});

  // Load ~/.fermi/.env before dispatching any subcommand so `init`
  // can detect previously saved keys and offer the expected reuse flow.
  (deps.loadDotenv ?? loadDotenv)(homeDir);

  await program.parseAsync(argv);

  // If a subcommand ran, exit — don't continue into TUI
  if (ranSubcommand) return;

  const opts = program.opts<{
    templates?: string;
    config?: string[];
    verbose?: boolean;
  }>();

  parseConfigOverridesOrExit(opts.config ?? []);

  // Apply staged update from a previous background download
  const applyResult = (deps.applyStaged ?? applyStaged)(homeDir);
  if (applyResult.kind === "applied") {
    if (deps.relaunchAfterUpdate) {
      deps.relaunchAfterUpdate(argv);
      return;
    }
    if (!deps.applyStaged) {
      relaunchCurrentBinary(argv);
      return;
    }
  }
  const effectiveVersion = applyResult.kind === "applied"
    ? (applyResult.version ?? VERSION)
    : VERSION;

  // Start update check in background (non-blocking) if enabled
  const loadSettings = deps.loadGlobalSettings ?? loadGlobalSettings;
  const autoUpdateSetting = loadSettings(homeDir).auto_update ?? true;
  if (autoUpdateSetting !== false) {
    const getter = (deps.checkForUpdates ?? checkForUpdates)(effectiveVersion, homeDir, autoUpdateSetting);
    setUpdateStateGetter(getter);
  }
  setRelaunchCallback(() => {
    if (deps.relaunchAfterUpdate) {
      deps.relaunchAfterUpdate(argv);
    } else {
      relaunchCurrentBinary(argv);
    }
  });

  // Logging
  if (opts.verbose) {
    const origDebug = console.debug;
    console.debug = (...args: unknown[]) => origDebug("[DEBUG]", ...args);
  }

  const globalSettings = await ensureProvidersConfigured(homeDir, deps);
  await warnIfCopilotCredentialsMissing(globalSettings, deps.hasGitHubTokens);

  // Best-effort, non-blocking: refresh the remote model registry for NEXT
  // startup. No-ops until a signing public key is embedded (registry-fetch.ts).
  startBackgroundRegistryRefresh();

  await (deps.launchTui ?? launchTuiFromDefaultEntry)();
}

function normalizeEntryPath(pathValue: string | undefined): string | null {
  if (!pathValue) return null;
  try {
    return realpathSync(resolve(pathValue));
  } catch {
    return null;
  }
}

const entryPath = normalizeEntryPath(process.argv[1]);
const modulePath = normalizeEntryPath(fileURLToPath(import.meta.url));
if (entryPath && modulePath && entryPath === modulePath) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
