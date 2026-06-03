/**
 * Windows shell provider — multi-shell with automatic fallback.
 *
 * Detection priority:
 *   1. Git Bash (MSYS2-backed bash from Git for Windows)
 *   2. pwsh (PowerShell 7+, cross-platform)
 *   3. powershell (Windows PowerShell 5.1, ships with Windows 10+)
 *
 * Git Bash is preferred because LLMs are trained on bash syntax and the
 * existing tree-sitter-bash permission classifier works unchanged.
 * When Git Bash is unavailable, we fall back to PowerShell so users
 * without Git for Windows can still use Fermi.
 *
 * Process-tree termination uses `taskkill /T /F /PID <pid>`, which
 * walks the descendant tree by parent-pid relationships.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ShellKind, ShellProvider, ShellSpawnRequest } from "../types.js";

// ------------------------------------------------------------------
// Env allowlists
// ------------------------------------------------------------------

// Shared Windows env vars needed by all shell types.
const WIN32_ENV_BASE = new Set([
  // Core paths
  "PATH", "PATHEXT", "HOME",
  // Windows installation roots
  "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "PROGRAMW6432",
  "COMSPEC",
  // User locations
  "USERPROFILE", "HOMEPATH", "HOMEDRIVE",
  "APPDATA", "LOCALAPPDATA",
  // Temp
  "TEMP", "TMP", "TMPDIR",
  // Locale / terminal
  "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES",
  "TERM", "COLORTERM", "TZ",
  // Color / CI
  "NO_COLOR", "FORCE_COLOR", "CI",
  // Username / login
  "USER", "USERNAME", "LOGONSERVER",
]);

// Extra vars only relevant when the shell is Git Bash (MSYS2).
const MSYS2_EXTRAS = new Set([
  "MSYSTEM", "MSYS", "MSYS2_ARG_CONV_EXCL", "SHELL",
]);

// Extra vars only relevant when the shell is PowerShell.
const POWERSHELL_EXTRAS = new Set([
  "PSMODULEPATH",
]);

// ------------------------------------------------------------------
// Detection: Git Bash
// ------------------------------------------------------------------

function detectGitBash(): string | null {
  // 1. Explicit override
  const override = process.env["FERMI_GIT_BASH_PATH"];
  if (override && existsSync(override)) return override;

  // 2. git.exe on PATH → derive <git-dir>/../../bin/bash.exe
  try {
    const result = spawnSync("where", ["git"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0 && typeof result.stdout === "string") {
      const gitPath = result.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      if (gitPath) {
        const gitRoot = dirname(dirname(gitPath));
        const candidate = join(gitRoot, "bin", "bash.exe");
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // `where` may fail under unusual environments; fall through.
  }

  // 3. Common install locations
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  if (process.env["PROGRAMFILES"]) {
    candidates.push(join(process.env["PROGRAMFILES"], "Git", "bin", "bash.exe"));
  }
  if (process.env["PROGRAMFILES(X86)"]) {
    candidates.push(join(process.env["PROGRAMFILES(X86)"], "Git", "bin", "bash.exe"));
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  return null;
}

// ------------------------------------------------------------------
// Detection: PowerShell
// ------------------------------------------------------------------

function detectPwsh(): string | null {
  try {
    const result = spawnSync("where", ["pwsh"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0 && typeof result.stdout === "string") {
      const path = result.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      if (path && existsSync(path)) return path;
    }
  } catch { /* fall through */ }
  return null;
}

function detectPowerShell(): string | null {
  try {
    const result = spawnSync("where", ["powershell"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0 && typeof result.stdout === "string") {
      const path = result.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      if (path && existsSync(path)) return path;
    }
  } catch { /* fall through */ }

  // powershell.exe ships with Windows 10+ at a well-known path.
  const systemRoot = process.env["SYSTEMROOT"] ?? "C:\\Windows";
  const fallback = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (existsSync(fallback)) return fallback;

  return null;
}

// ------------------------------------------------------------------
// Shell resolution
// ------------------------------------------------------------------

interface ResolvedShell {
  kind: ShellKind;
  path: string;
}

function resolveShell(): ResolvedShell {
  if (process.platform !== "win32") {
    return { kind: "bash", path: "win32-shell-not-active-on-this-platform" };
  }

  const gitBash = detectGitBash();
  if (gitBash) return { kind: "bash", path: gitBash };

  const pwsh = detectPwsh();
  if (pwsh) return { kind: "pwsh", path: pwsh };

  const ps = detectPowerShell();
  if (ps) return { kind: "powershell", path: ps };

  throw new Error(
    "Fermi on Windows requires one of: Git Bash, PowerShell 7+ (pwsh), or Windows PowerShell.\n" +
    "  • Git Bash (recommended): https://git-scm.com/download/win\n" +
    "  • PowerShell 7+: https://aka.ms/powershell\n" +
    "Tried: git bash (not found), pwsh (not found), powershell (not found).",
  );
}

/** Whether the resolved shell is a PowerShell variant. */
function isPowerShell(kind: ShellKind): boolean {
  return kind === "pwsh" || kind === "powershell";
}

const RESOLVED: ResolvedShell = resolveShell();

// ------------------------------------------------------------------
// Env filtering
// ------------------------------------------------------------------

function buildEnv(): NodeJS.ProcessEnv {
  const extras = isPowerShell(RESOLVED.kind) ? POWERSHELL_EXTRAS : MSYS2_EXTRAS;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    const upper = key.toUpperCase();
    if (WIN32_ENV_BASE.has(upper) || extras.has(upper) || upper.startsWith("LC_")) {
      env[key] = value;
    }
  }
  if (!env["PATH"]) {
    env["PATH"] = "C:\\Windows\\System32;C:\\Windows";
  }
  return env;
}

// ------------------------------------------------------------------
// Provider
// ------------------------------------------------------------------

export const win32Shell: ShellProvider = {
  kind: RESOLVED.kind,
  path: RESOLVED.path,

  spawn(request: ShellSpawnRequest): ChildProcess {
    if (isPowerShell(RESOLVED.kind)) {
      // PowerShell: -NoLogo suppresses the startup banner,
      // -NoProfile skips user profile scripts (deterministic env),
      // -NonInteractive prevents prompts blocking the subprocess.
      return spawn(RESOLVED.path, [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", request.command,
      ], {
        cwd: request.cwd,
        env: request.env ?? buildEnv(),
        stdio: request.stdio ?? ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    }

    // Git Bash
    const flag = request.loginShell ? "-lc" : "-c";
    return spawn(RESOLVED.path, [flag, request.command], {
      cwd: request.cwd,
      env: request.env ?? buildEnv(),
      stdio: request.stdio ?? ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  },

  killTree(child: ChildProcess, signal: NodeJS.Signals): void {
    const pid = child.pid;
    if (pid != null) {
      try {
        const force = signal === "SIGKILL" ? ["/F"] : [];
        spawnSync("taskkill", ["/PID", String(pid), "/T", ...force], {
          stdio: "ignore",
          windowsHide: true,
        });
        return;
      } catch {
        // Fall through to direct child.kill.
      }
    }
    try { child.kill(signal); } catch {}
  },

  buildChildEnv: buildEnv,
};
