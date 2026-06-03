/**
 * System prompt assembler — builds the full system prompt from layers.
 *
 * Follows Fermi's pattern: agent base prompt + prompt layers.
 *
 * Formula:
 *   systemPrompt =
 *     agent.prompt                    ← from template (role + tools + knowledge)
 *     + memory layer (AGENTS.md)      ← from disk, refreshed per-reload
 *     + agent model pins              ← from config
 *     + variable rendering            ← {PROJECT_ROOT}/{SESSION_ARTIFACTS}/{SYSTEM_DATA} → real paths
 *     + Session Configuration         ← session start timestamp, appended last
 *
 * All layers are assembled here — Session no longer does ad-hoc string concatenation.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getFermiHomeDir } from "./home-path.js";

// ------------------------------------------------------------------
// Prompt layer types
// ------------------------------------------------------------------

export interface PromptLayer {
  id: string;
  order: number;
  content: () => string;
}

// ------------------------------------------------------------------
// Session Configuration (dynamic appendix, appended last for cache stability)
// ------------------------------------------------------------------

export interface PromptVariables {
  projectRoot: string;
  sessionArtifacts: string;
  systemData: string;
  /** ISO timestamp of when this session began (its first message). Stable across resumes. */
  sessionStartedAt?: string;
  /** Shell-specific notes injected into the tools prompt (bash vs PowerShell). */
  shellNotes?: string;
}

/**
 * Format the session-start anchor line, or null if the timestamp is missing/invalid.
 *
 * Renders the session's start time in the runtime's local timezone so the agent
 * can reason about time of day naturally. We deliberately do NOT instruct the
 * agent to comment on it — providing the fact is enough; forcing a reaction would
 * turn into a tic. The value is stable for the whole session (and across resumes),
 * so it stays cache-friendly even though it lives in the dynamic appendix.
 */
function formatSessionStartLine(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let tz: string;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    tz = "local time";
  }
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("en-US", {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz === "local time" ? undefined : tz,
    }).format(d);
  } catch {
    formatted = d.toISOString();
  }
  return (
    `This conversation began on ${formatted} (${tz}) — the time of the user's first message. ` +
    "A session can be resumed after an arbitrarily long gap, so treat this as the *start* time, " +
    "not necessarily the current time. When you need the current time, call the `time` tool."
  );
}

/**
 * Substitute path variables with the session's real absolute paths.
 *
 * Renders `{PROJECT_ROOT}` / `{SESSION_ARTIFACTS}` / `{SYSTEM_DATA}` in the
 * prompt body, so the model sees concrete paths in tool-call examples and
 * instructions rather than a token it might paste verbatim. Within a session
 * (and across sessions in the same project) the rendered body is stable, so it
 * stays cache-friendly turn-to-turn.
 */
export function renderPromptVariables(prompt: string, vars: PromptVariables): string {
  return prompt
    .replace(/\{PROJECT_ROOT\}/g, vars.projectRoot)
    .replace(/\{SESSION_ARTIFACTS\}/g, vars.sessionArtifacts)
    .replace(/\{SYSTEM_DATA\}/g, vars.systemData)
    .replace(/\{SHELL_NOTES\}/g, vars.shellNotes ?? "");
}

/**
 * Build the Session Configuration appendix.
 *
 * Path variables are substituted inline in the prompt body (see
 * renderPromptVariables), so this trailing section carries only the session
 * start timestamp — a small piece of ambient context kept at the very end.
 * Returns "" when no valid start time is available.
 */
export function buildSessionConfigSection(vars: PromptVariables): string {
  const startedLine = formatSessionStartLine(vars.sessionStartedAt);
  if (!startedLine) return "";
  return ["", "---", "", "# Session Configuration", "", startedLine].join("\n");
}

// ------------------------------------------------------------------
// Built-in layers
// ------------------------------------------------------------------

/**
 * Read AGENTS.md persistent memory from global + project paths.
 * Returns empty string if no memory files exist.
 */
export function readAgentsMemory(projectRoot: string): string {
  const parts: string[] = [];

  const globalPath = join(getFermiHomeDir(), "AGENTS.md");
  if (existsSync(globalPath)) {
    try {
      const content = readFileSync(globalPath, "utf-8").trim();
      if (content) parts.push(`## Global Memory\n\n${content}`);
    } catch { /* ignore */ }
  }

  const projectPath = join(projectRoot, "AGENTS.md");
  if (existsSync(projectPath)) {
    try {
      const content = readFileSync(projectPath, "utf-8").trim();
      if (content) parts.push(`## Project Memory\n\n${content}`);
    } catch { /* ignore */ }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Build a prompt section listing agent model pins.
 */
export function buildAgentModelPinsSection(
  agentModels: Record<string, { provider: string; selection_key: string; model_id: string; thinking_level?: string }>,
): string | null {
  const entries = Object.entries(agentModels);
  if (entries.length === 0) return null;

  const lines = entries.map(([template, model]) => {
    const parts = [`- **${template}**: ${model.model_id}`];
    if (model.thinking_level) parts[0] += ` (thinking: ${model.thinking_level})`;
    return parts[0];
  });

  return [
    "",
    "The following sub-agent templates have user-pinned models.",
    "When spawning these agents, do NOT specify `model_level` — the pinned model will be used automatically:",
    "",
    ...lines,
  ].join("\n");
}

// ------------------------------------------------------------------
// Assembler
// ------------------------------------------------------------------

export interface AssembleOptions {
  /** Base agent prompt (from template: role + tools + knowledge). */
  agentPrompt: string;
  /** Project root path (for AGENTS.md and variable rendering). */
  projectRoot: string;
  /** Session artifacts directory path. */
  sessionArtifacts: string;
  /** System data directory path. */
  systemData: string;
  /** ISO timestamp of when this session began (its first message). Stable across resumes. */
  sessionStartedAt?: string;
  /** Agent model pins from config (for the model pins section). */
  agentModels?: Record<string, { provider: string; selection_key: string; model_id: string; thinking_level?: string }>;
  /** Shell-specific notes (bash vs PowerShell) for {SHELL_NOTES} variable. */
  shellNotes?: string;
  /** Additional prompt layers (hooks, injected turns, etc.). */
  extraLayers?: PromptLayer[];
}

/**
 * Assemble the full system prompt from agent base + layers + variables.
 *
 * This is the single entry point for system prompt construction.
 * Called at session init and on each reload (AGENTS.md edit, /reload, etc.).
 */
export function assembleFullSystemPrompt(opts: AssembleOptions): string {
  let prompt = opts.agentPrompt;

  // Layer: AGENTS.md persistent memory
  const memory = readAgentsMemory(opts.projectRoot);
  if (memory) {
    prompt = prompt.trimEnd() +
      "\n\n---\n\n# Persistent Memory (AGENTS.md)\n\n" +
      memory;
  }

  // Layer: agent model pins
  if (opts.agentModels) {
    const pinsSection = buildAgentModelPinsSection(opts.agentModels);
    if (pinsSection) {
      prompt = prompt.trimEnd() + "\n\n" + pinsSection;
    }
  }

  // Layer: extra (hooks, injected turns — future extension point)
  if (opts.extraLayers) {
    const sorted = [...opts.extraLayers].sort((a, b) => a.order - b.order);
    for (const layer of sorted) {
      const content = layer.content();
      if (content) {
        prompt = prompt.trimEnd() + "\n\n" + content;
      }
    }
  }

  // Substitute path variables ({PROJECT_ROOT} etc.) with the session's real
  // absolute paths. Runs last so variables in any layer (AGENTS.md, hooks) are
  // also resolved.
  const vars = {
    projectRoot: opts.projectRoot,
    sessionArtifacts: opts.sessionArtifacts,
    systemData: opts.systemData,
    sessionStartedAt: opts.sessionStartedAt,
    shellNotes: opts.shellNotes,
  };
  prompt = renderPromptVariables(prompt, vars);

  // Session Configuration (session start timestamp, appended last).
  prompt += buildSessionConfigSection(vars);

  return prompt;
}
