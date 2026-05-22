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
 *     + Session Configuration (dynamic, appended last for cache stability)
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
 * Normalize legacy `{PROJECT_ROOT}`-style placeholders (from older custom
 * templates) to the static `[project]` / `[session]` / `[system]` form.
 *
 * This is a pure text transform — it does NOT substitute real paths. Real paths
 * appear only in the Session Configuration appendix, so the normalized body
 * stays identical across sessions and fully cacheable. Idempotent: running it on
 * an already-normalized prompt is a no-op.
 */
function normalizeLegacyPathPlaceholders(prompt: string): string {
  return prompt
    .replace(/\{PROJECT_ROOT\}/g, "[project]")
    .replace(/\{SESSION_ARTIFACTS\}/g, "[session]")
    .replace(/\{SYSTEM_DATA\}/g, "[system]");
}

/**
 * Build the Session Configuration appendix.
 *
 * This is the ONLY place where session-specific values (paths, start time)
 * appear in the system prompt. The body uses static placeholders (`[project]`,
 * `[session]`, `[system]`) that are identical across all sessions.
 * Appending this section last keeps the entire body cacheable.
 */
export function buildSessionConfigSection(vars: PromptVariables): string {
  const lines = [
    "",
    "---",
    "",
    "# Session Configuration",
    "",
    "In the prompt above, placeholder references like `[project]`, `[session]`, and `[system]` refer to the following directories. These are the only session-specific values in this prompt — everything above this section is identical across sessions.",
    "",
    `- \`[project]\`  = ${vars.projectRoot}  — Target project directory. Read/write project source files here.`,
    `- \`[session]\`  = ${vars.sessionArtifacts}  — Session-local storage for call files, scratch files, and custom sub-agent templates. Does not persist across sessions. Always use absolute paths with this directory.`,
    `- \`[system]\`   = ${vars.systemData}  — Cross-session persistent storage. Managed by the system; do not access directly.`,
  ];

  const startedLine = formatSessionStartLine(vars.sessionStartedAt);
  if (startedLine) {
    lines.push("", startedLine);
  }

  return lines.join("\n");
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

  // Normalize legacy {PROJECT_ROOT}-style placeholders (from older custom
  // templates) to the static [project]/[session]/[system] form. Runs on the
  // whole body but BEFORE the config appendix, so real paths are never touched.
  prompt = normalizeLegacyPathPlaceholders(prompt);

  // Session Configuration (dynamic, appended last for prompt cache stability)
  prompt += buildSessionConfigSection({
    projectRoot: opts.projectRoot,
    sessionArtifacts: opts.sessionArtifacts,
    systemData: opts.systemData,
    sessionStartedAt: opts.sessionStartedAt,
  });

  return prompt;
}
