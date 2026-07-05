import { rpcRequest } from "./vscode-api.js";
import { useStore, type NewInfoCard } from "./store.js";
import { filterByPrefix, findCatalogNode, modelLeafDescription } from "./model.js";
import type {
  SummarizeTarget,
  RewindTarget,
  ShellSnapshot,
  SkillInfo,
  McpStatusPayload,
  HooksStatusPayload,
  ThinkingLevelsPayload,
  SharedSettingsPayload,
  ModelCatalogNode,
} from "../src/types.js";
import reviewTemplate from "../../prompts/review.md";

// ---------------------------------------------------------------------------
// Slash command registry + interactive flows. Every command that needs a
// choice opens a picker INSIDE the command panel — no typed sub-arguments,
// no native QuickPick detours. Mirrors the TUI's command surface where the
// server exposes the capability; terminal-only commands (theme, raw, …) are
// intentionally absent because VS Code owns those concerns here.
// ---------------------------------------------------------------------------

export interface PickerItem {
  label: string;
  description?: string;
  detail?: string;
  value: string;
  active?: boolean;
  checked?: boolean;
  disabled?: boolean;
}

type FlowResult = void | PanelView | Promise<void | PanelView>;

export interface PickerSpec {
  title: string;
  items: PickerItem[];
  emptyText?: string;
  /** Checkbox mode: Space toggles, Enter commits the checked set. */
  checkbox?: boolean;
  onSelect?: (value: string) => FlowResult;
  onCommit?: (checkedValues: string[]) => FlowResult;
}

export interface InputSpec {
  title: string;
  placeholder?: string;
  initial?: string;
  allowEmpty?: boolean;
  onSubmit: (text: string) => FlowResult;
}

export type PanelView =
  | { kind: "picker"; spec: PickerSpec }
  | { kind: "input"; spec: InputSpec };

export interface SlashCommand {
  name: string;
  description: string;
  group: "Session" | "Context" | "Config" | "Info" | "Skills";
  run: () => FlowResult;
}

export const COMMAND_GROUPS: ReadonlyArray<SlashCommand["group"]> = [
  "Session",
  "Context",
  "Config",
  "Skills",
  "Info",
];

const picker = (spec: PickerSpec): PanelView => ({ kind: "picker", spec });
const input = (spec: InputSpec): PanelView => ({ kind: "input", spec });

function state() {
  return useStore.getState();
}

function hasCapability(name: string): boolean {
  return state().meta?.capabilities?.includes(name) ?? false;
}

function addCard(card: NewInfoCard): void {
  state().addInfoCard(card);
}

function textCard(title: string, body: string, mono = false): void {
  addCard({ kind: "text", title, body, mono });
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

function relativeTime(isoOrMs?: string | number): string {
  if (isoOrMs === undefined) return "";
  const then = typeof isoOrMs === "number" ? isoOrMs : new Date(isoOrMs).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Mirrors src/modes/index.ts MODE_DESCRIPTIONS (shared with the composer's
// mode selector) ──
export const MODE_DESCRIPTIONS: Record<string, string> = {
  default: "Balanced everyday collaboration",
  vibe: "You steer by outcomes; the agent owns the implementation",
  scale: "Large multi-part work: design first, delegate reading, checkpoint discipline",
  auto: "Long-running self-directed loops: ledger, verify-then-advance, keep going",
};
export const AGENT_MODES = ["default", "vibe", "scale", "auto"];

const PERMISSION_MODES = [
  { mode: "reversible", label: "Approve edits", desc: "Ask before file changes" },
  { mode: "yolo", label: "Full access", desc: "No approval needed" },
  { mode: "read_only", label: "Read only", desc: "No file modifications" },
];

// ── /review helpers (mirror src/commands.ts buildReviewTarget/Prompt) ──

function buildReviewTarget(kind: string, detail?: string): string {
  switch (kind) {
    case "uncommitted":
      return [
        "Review all uncommitted changes in the current repository.",
        "Run `git diff` for unstaged changes, `git diff --cached` for staged changes,",
        "and `git status --short` to identify untracked files. Read their contents.",
      ].join("\n");
    case "base": {
      const branch = detail || "main";
      return [
        `Review all changes on the current branch compared to \`${branch}\`.`,
        `Run \`git diff ${branch}...HEAD\` to get the diff.`,
        "Also check `git log --oneline " + branch + "..HEAD` for commit context.",
      ].join("\n");
    }
    case "commit": {
      const sha = detail || "HEAD";
      return [
        `Review the specific commit \`${sha}\`.`,
        `Run \`git show ${sha}\` to get the diff and commit message.`,
      ].join("\n");
    }
    default:
      return "Review the changes described in the user instructions below.";
  }
}

function buildReviewPrompt(reviewTarget: string, userInstructions: string): string {
  const template = reviewTemplate;
  if (!template) {
    return `Review the following code changes.\n\n${reviewTarget}\n\n${userInstructions}`;
  }
  return template
    .replace("{REVIEW_TARGET}", reviewTarget)
    .replace("{USER_INSTRUCTIONS}", userInstructions || "(No additional instructions.)");
}

function reviewDisplayText(kind: string, detail: string, note: string): string {
  const parts = ["/review"];
  switch (kind) {
    case "uncommitted": parts.push("uncommitted changes"); break;
    case "base": parts.push(`against ${detail || "base"}`); break;
    case "commit": parts.push(`commit ${detail || "HEAD"}`); break;
    case "custom": break;
  }
  if (note) parts.push(note);
  return parts.join(" ");
}

async function dispatchReview(kind: string, detail: string, note: string): Promise<void> {
  const content = buildReviewPrompt(buildReviewTarget(kind, detail), note);
  const displayText = reviewDisplayText(kind, detail, note);
  if (hasCapability("injectedTurn")) {
    await rpcRequest("session.runInjectedTurn", { displayText, content });
  } else {
    await state().submitTurn(content);
  }
}

// ── Model picker (grouped catalog) ──

/**
 * Switch to `name`, then chain into the thinking-level picker like the TUI's
 * /model. `name` is a config name or provider:selectionKey; the server
 * resolves preset models and auto-configures already-authenticated providers.
 * A provider needing a key throws a helpful message we surface as a card.
 */
async function selectModelThenThinking(name: string): Promise<PanelView | void> {
  try {
    await rpcRequest("session.selectModel", { name });
  } catch (err) {
    textCard("Model", err instanceof Error ? err.message : String(err));
    return;
  }
  if (!hasCapability("thinkingLevel")) return;
  const t = await rpcRequest<ThinkingLevelsPayload>("session.getThinkingLevels");
  if (!t || t.levels.length <= 1) return;
  return picker({
    title: "Thinking level",
    items: t.levels.map((level) => ({
      label: level,
      value: level,
      active: level === t.current,
    })),
    onSelect: async (level) => {
      await rpcRequest("session.setThinkingLevel", { level });
    },
  });
}

/** A drill-down picker over the grouped model catalog. */
function modelCatalogPicker(nodes: ModelCatalogNode[], title: string): PanelView {
  return picker({
    title,
    emptyText: "No models available",
    items: nodes.map((node) => {
      const isBranch = Boolean(node.children && node.children.length > 0);
      if (isBranch) {
        return {
          label: node.label,
          description: node.brandLabel && node.brandLabel !== node.label ? node.brandLabel : undefined,
          detail: `${node.children!.length} ›`,
          value: node.value,
        };
      }
      return {
        label: node.label,
        description: modelLeafDescription(node),
        value: node.value,
        active: node.isCurrent,
      };
    }),
    onSelect: (value) => {
      const node = findCatalogNode(nodes, value);
      if (node?.children && node.children.length > 0) {
        return modelCatalogPicker(node.children as ModelCatalogNode[], node.label);
      }
      return selectModelThenThinking(value);
    },
  });
}

// ── Command implementations ──

const builtinCommands: SlashCommand[] = [
  // ── Session ──
  {
    name: "/new",
    description: "Start a new session",
    group: "Session",
    run: () => void rpcRequest("__ext.newSession"),
  },
  {
    name: "/session",
    description: "Resume a previous session",
    group: "Session",
    run: async () => {
      await state().refreshSessions();
      const sessions = state().sessions;
      return picker({
        title: "Resume session",
        emptyText: "No saved sessions in this workspace",
        items: sessions.map((s) => ({
          label: truncate(s.title || s.summary || s.sessionId, 60),
          description: `${typeof s.turns === "number" ? `${s.turns} turns · ` : ""}${relativeTime(s.lastActiveAt)}`,
          value: s.sessionId,
        })),
        onSelect: async (sessionId) => {
          await state().restoreSession(sessionId);
        },
      });
    },
  },
  {
    name: "/rename",
    description: "Rename current session",
    group: "Session",
    run: () =>
      input({
        title: "Rename session",
        placeholder: "Session title…",
        initial: state().meta?.title ?? "",
        onSubmit: async (title) => {
          await rpcRequest("session.setTitle", { title });
        },
      }),
  },
  {
    name: "/fork",
    description: "Fork this session into a new branch",
    group: "Session",
    run: async () => {
      if (state().status?.currentTurnRunning) {
        textCard("Fork", "Cannot fork while a turn is running.");
        return;
      }
      try {
        const forked = await rpcRequest<{ sessionId: string; title: string; sourceSessionId: string }>("session.fork");
        await state().restoreSession(forked.sessionId);
        textCard("Fork", `Now on "${forked.title}". To continue the original, use /session and pick ${forked.sourceSessionId.slice(0, 8)}…`);
      } catch (err) {
        textCard("Fork", err instanceof Error ? err.message : String(err));
      }
    },
  },
  {
    name: "/rewind",
    description: "Rewind the conversation to a previous turn",
    group: "Session",
    run: async () => {
      const targets = await rpcRequest<RewindTarget[]>("session.getRewindTargets");
      return picker({
        title: "Rewind to",
        emptyText: "Nothing to rewind",
        items: (targets ?? []).map((t) => ({
          label: `Turn ${t.turnIndex} · ${truncate(t.preview, 48)}`,
          description: [
            t.fileCount > 0 ? `${t.fileCount} files` : "",
            t.additions > 0 ? `+${t.additions}` : "",
            t.deletions > 0 ? `−${t.deletions}` : "",
            relativeTime(t.timestamp),
          ].filter(Boolean).join(" · "),
          value: String(t.turnIndex),
        })),
        onSelect: async (v) => {
          await rpcRequest("session.rewind", { toTurnIndex: Number(v) });
        },
      });
    },
  },
  {
    name: "/review",
    description: "Review code changes",
    group: "Session",
    run: () =>
      picker({
        title: "Review",
        items: [
          { label: "Review against a base branch", detail: "PR style", value: "base" },
          { label: "Review uncommitted changes", value: "uncommitted" },
          { label: "Review a commit", value: "commit" },
          { label: "Custom review instructions", value: "custom" },
        ],
        onSelect: async (kind) => {
          if (kind === "uncommitted") {
            await dispatchReview("uncommitted", "", "");
            return;
          }
          if (kind === "custom") {
            return input({
              title: "Review instructions",
              placeholder: "What should be reviewed?",
              onSubmit: (note) => dispatchReview("custom", "", note),
            });
          }
          if (kind === "base") {
            const branches = await rpcRequest<string[]>("__ext.gitBranches");
            return picker({
              title: "Base branch",
              emptyText: "No other branches found",
              items: (branches ?? []).map((b) => ({ label: b, value: b })),
              onSelect: (branch) => dispatchReview("base", branch, ""),
            });
          }
          const commits = await rpcRequest<Array<{ sha: string; subject: string }>>("__ext.gitLog");
          return picker({
            title: "Commit",
            emptyText: "No commits found",
            items: (commits ?? []).map((c) => ({ label: `${c.sha.slice(0, 7)} ${truncate(c.subject, 56)}`, value: c.sha })),
            onSelect: (sha) => dispatchReview("commit", sha, ""),
          });
        },
      }),
  },
  {
    name: "/copy",
    description: "Copy the last response",
    group: "Session",
    run: async () => {
      const conv = state().conversation;
      for (let i = conv.length - 1; i >= 0; i--) {
        if (conv[i].kind === "assistant" && conv[i].text.trim()) {
          try {
            await navigator.clipboard.writeText(conv[i].text);
          } catch {}
          return;
        }
      }
      textCard("Copy", "No assistant response to copy yet.");
    },
  },

  // ── Context ──
  {
    name: "/compact",
    description: "Compact the active context",
    group: "Context",
    run: () =>
      input({
        title: "Compact context",
        placeholder: "Optional instruction — Enter to compact",
        allowEmpty: true,
        onSubmit: async (text) => {
          await rpcRequest("session.compact", text.trim() ? { instruction: text.trim() } : {});
        },
      }),
  },
  {
    name: "/summarize",
    description: "Summarize a range of older turns",
    group: "Context",
    run: async () => {
      const targets = await rpcRequest<SummarizeTarget[]>("session.getSummarizeTargets");
      const list = targets ?? [];
      const item = (t: SummarizeTarget): PickerItem => ({
        label: `${t.kind === "summary" ? "Summary" : "Turn"} ${t.turnIndex} · ${truncate(t.preview, 46)}`,
        description: relativeTime(t.timestamp),
        value: String(t.turnIndex),
      });
      return picker({
        title: "Summarize from",
        emptyText: "Nothing to summarize yet",
        items: list.map(item),
        onSelect: (fromStr) => {
          const from = Number(fromStr);
          return picker({
            title: "Summarize to",
            items: list.filter((t) => t.turnIndex >= from).map(item),
            onSelect: (toStr) =>
              input({
                title: "Focus (optional)",
                placeholder: "What should the summary preserve? Enter to skip",
                allowEmpty: true,
                onSubmit: async (focus) => {
                  const ids = await rpcRequest<string[]>("session.getContextIdsForTurnRange", {
                    startTurn: from,
                    endTurn: Number(toStr),
                  });
                  await rpcRequest("session.summarize", {
                    targetContextIds: ids,
                    ...(focus.trim() ? { focusPrompt: focus.trim() } : {}),
                  });
                },
              }),
          });
        },
      });
    },
  },
  {
    name: "/usage",
    description: "Show session token usage",
    group: "Context",
    run: () => addCard({ kind: "usage" }),
  },

  // ── Config ──
  {
    name: "/model",
    description: "Switch model",
    group: "Config",
    run: async () => {
      // Grouped catalog (capability "modelCatalog") — clean labels, provider
      // hierarchy, credential state. Falls back to the flat configured list on
      // older binaries.
      if (hasCapability("modelCatalog")) {
        const catalog = await rpcRequest<ModelCatalogNode[]>("session.getModelCatalog");
        if (Array.isArray(catalog) && catalog.length > 0) {
          return modelCatalogPicker(catalog, "Model");
        }
      }
      const s = state();
      return picker({
        title: "Model",
        emptyText: "No models configured",
        items: s.models.map((m) => ({
          label: m.name,
          description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
          value: m.name,
          active: m.name === s.meta?.modelConfigName,
        })),
        onSelect: (name) => selectModelThenThinking(name),
      });
    },
  },
  {
    name: "/permission",
    description: "Set permission mode",
    group: "Config",
    run: () => {
      const current = state().status?.permissionMode;
      return picker({
        title: "Permissions",
        items: PERMISSION_MODES.map((p) => ({
          label: p.label,
          description: p.desc,
          value: p.mode,
          active: p.mode === current,
        })),
        onSelect: async (mode) => {
          await rpcRequest("session.setPermissionMode", { mode });
        },
      });
    },
  },
  {
    name: "/mode",
    description: "Switch agent mode",
    group: "Config",
    run: () => {
      const current = state().agentMode;
      return picker({
        title: "Agent mode",
        items: AGENT_MODES.map((m) => ({
          label: m,
          description: MODE_DESCRIPTIONS[m] ?? "",
          value: m,
          active: m === current,
        })),
        onSelect: async (mode) => {
          await rpcRequest("session.setMode", { mode });
          await state().refreshMode();
        },
      });
    },
  },
  {
    name: "/goal",
    description: "Set a completion goal the agent keeps pursuing",
    group: "Config",
    run: () => {
      const goal = state().goal;
      const items: PickerItem[] = [];
      if (goal) {
        items.push({ label: `Active: ${truncate(goal, 52)}`, value: "", disabled: true });
        items.push({ label: "Clear goal", value: "clear" });
      }
      items.push({ label: goal ? "Replace goal…" : "Set goal…", value: "set" });
      return picker({
        title: "Goal",
        items,
        onSelect: async (v) => {
          if (v === "clear") {
            await rpcRequest("session.clearGoal");
            await state().refreshGoal();
            return;
          }
          return input({
            title: "Goal condition",
            placeholder: "e.g. all tests pass and the feature works end-to-end",
            initial: goal ?? "",
            onSubmit: async (condition) => {
              await rpcRequest("session.setGoal", { condition });
              await state().refreshGoal();
            },
          });
        },
      });
    },
  },
  {
    name: "/skills",
    description: "Enable or disable skills",
    group: "Config",
    run: async () => {
      await state().refreshSkills();
      const skills = state().skills;
      return picker({
        title: "Skills — Space to toggle, Enter to apply",
        checkbox: true,
        emptyText: "No skills found",
        items: skills.map((s) => ({
          label: s.name,
          description: truncate(s.description, 60),
          value: s.name,
          checked: s.enabled,
        })),
        onCommit: async (checked) => {
          const checkedSet = new Set(checked);
          for (const s of state().skills) {
            const next = checkedSet.has(s.name);
            if (next !== s.enabled) {
              await rpcRequest("session.setSkillEnabled", { name: s.name, enabled: next });
            }
          }
          await state().refreshSkills();
        },
      });
    },
  },
  {
    name: "/tier",
    description: "Pin sub-agent model tiers",
    group: "Config",
    run: async () => {
      const status = await rpcRequest<{ tiers: Array<{ level: string; configName: string | null; label: string }> }>(
        "session.getModelTiers",
      );
      return picker({
        title: "Model tier",
        items: (status?.tiers ?? []).map((t) => ({
          label: t.level,
          description: t.configName ?? t.label,
          value: t.level,
        })),
        onSelect: (level) => {
          const s = state();
          const items: PickerItem[] = [
            { label: "Inherit main model", value: "", active: false },
            ...s.models.map((m) => ({
              label: m.name,
              description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
              value: m.name,
            })),
          ];
          return picker({
            title: `Model for ${level} tier`,
            items,
            onSelect: async (modelName) => {
              await rpcRequest("session.setModelTier", { level, modelName: modelName || null });
            },
          });
        },
      });
    },
  },

  // ── Info ──
  {
    name: "/shells",
    description: "View or stop background shells",
    group: "Info",
    run: async () => {
      const snaps = await rpcRequest<ShellSnapshot[]>("session.getBackgroundShellSnapshots");
      return picker({
        title: "Background shells",
        emptyText: "No background shells",
        items: (snaps ?? []).map((sh) => ({
          label: truncate(sh.command, 56),
          description: `${sh.status}${sh.exitCode !== null ? ` (${sh.exitCode})` : ""} · ${Math.round(sh.elapsedSeconds)}s`,
          value: sh.id,
        })),
        onSelect: (id) =>
          picker({
            title: "Shell",
            items: [
              { label: "View output", value: "view" },
              { label: "Stop shell", value: "stop" },
            ],
            onSelect: async (action) => {
              if (action === "view") {
                const detail = await rpcRequest<{ command: string; logTail: string; logTruncated: boolean }>(
                  "session.getBackgroundShellDetail",
                  { id, maxChars: 8000 },
                );
                textCard(
                  `$ ${truncate(detail.command, 70)}`,
                  (detail.logTruncated ? "…\n" : "") + (detail.logTail || "(no output)"),
                  true,
                );
                return;
              }
              const res = await rpcRequest<{ message: string }>("session.stopBackgroundShell", { id });
              textCard("Background shell", res?.message ?? "Stopped.");
            },
          }),
      });
    },
  },
  {
    name: "/mcp",
    description: "Manage MCP servers",
    group: "Info",
    run: async () => {
      const data = await rpcRequest<McpStatusPayload>("session.getMcpStatus");
      if (!hasCapability("mcpControl")) {
        addCard({ kind: "mcp", data });
        return;
      }
      const servers = data?.servers ?? [];
      return picker({
        title: "MCP servers",
        emptyText: "No MCP servers configured (settings.json → mcp_servers)",
        items: [
          ...(servers.length > 0 ? [{ label: "Reload config", value: "__reload__" }] : []),
          ...servers.map((srv) => ({
            label: srv.name,
            description: srv.disabled
              ? "disabled"
              : `${srv.state ?? "not connected"}${srv.tools.length > 0 ? ` · ${srv.tools.length} tools` : ""}${srv.error ? ` · ${srv.error}` : ""}`,
            value: srv.name,
          })),
        ],
        onSelect: async (value) => {
          if (value === "__reload__") {
            const r = await rpcRequest<{ report: string }>("session.reloadMcp");
            textCard("MCP", r?.report ?? "Reloaded.");
            return;
          }
          const srv = servers.find((s) => s.name === value);
          const disabled = srv?.disabled === true;
          return picker({
            title: value,
            items: [
              ...(!disabled ? [{ label: "Reconnect", value: "reconnect" }] : []),
              disabled
                ? { label: "Enable", value: "enable" }
                : { label: "Disable", value: "disable" },
              ...(srv && srv.tools.length > 0
                ? [{ label: `View tools (${srv.tools.length})`, value: "tools" }]
                : []),
            ],
            onSelect: async (op) => {
              if (op === "tools") {
                textCard(`${value} tools`, (srv?.tools ?? []).join("\n"), true);
                return;
              }
              if (op === "reconnect") {
                const r = await rpcRequest<{ ok: boolean }>("session.reconnectMcpServer", { name: value });
                textCard("MCP", `${value}: ${r?.ok ? "reconnected" : "reconnect failed"}`);
                return;
              }
              const enabled = op === "enable";
              const r = await rpcRequest<{ report: string }>("session.setMcpServerEnabled", { name: value, enabled });
              textCard("MCP", `${value}: ${enabled ? "enabled" : "disabled"}${r?.report ? ` (${r.report})` : ""}`);
            },
          });
        },
      });
    },
  },
  {
    name: "/hooks",
    description: "Manage hooks",
    group: "Info",
    run: async () => {
      const data = await rpcRequest<HooksStatusPayload>("session.getHooksStatus");
      if (!hasCapability("hooksControl")) {
        addCard({ kind: "hooks", data });
        return;
      }
      const hooks = data?.hooks ?? [];
      return picker({
        title: "Hooks — select to toggle",
        emptyText: "No hooks configured",
        items: [
          ...(hooks.length > 0 ? [{ label: "Reload hooks", value: "__reload__" }] : []),
          ...hooks.map((h) => ({
            label: h.disabled ? `${h.name} (disabled)` : h.name,
            description: `${h.scope} · ${h.event}${h.matcher ? ` [${h.matcher}]` : ""}`,
            value: h.name,
          })),
        ],
        onSelect: async (value) => {
          if (value === "__reload__") {
            const r = await rpcRequest<{ count: number }>("session.reloadHooks");
            textCard("Hooks", `Reloaded: ${r?.count ?? 0} active`);
            return;
          }
          const hook = hooks.find((h) => h.name === value);
          const enable = hook?.disabled === true;
          await rpcRequest("session.setHookEnabled", { name: value, enabled: enable });
          textCard("Hooks", `${value}: ${enable ? "enabled" : "disabled"}`);
        },
      });
    },
  },
  {
    name: "/autoupdate",
    description: "Background update checks",
    group: "Config",
    run: async () => {
      if (!hasCapability("sharedSettings")) {
        textCard("Auto-update", "This Fermi binary does not expose shared settings yet — update it first.");
        return;
      }
      const current = await rpcRequest<SharedSettingsPayload>("settings.get");
      const mode = current?.auto_update ?? true;
      return picker({
        title: "Auto-update",
        items: [
          { label: "On", description: "Download and apply updates automatically", value: "on", active: mode === true },
          { label: "Notify only", description: "Check and show a notice, don't install", value: "notify", active: mode === "notify" },
          { label: "Off", description: "No background update checks", value: "off", active: mode === false },
        ],
        onSelect: async (v) => {
          await rpcRequest("settings.patch", { auto_update: v === "on" ? true : v === "notify" ? "notify" : false });
        },
      });
    },
  },
  {
    name: "/summarize_hint",
    description: "Two-tier context summarize hints",
    group: "Config",
    run: async () => {
      if (!hasCapability("sharedSettings")) {
        textCard("Summarize hints", "This Fermi binary does not expose shared settings yet — update it first.");
        return;
      }
      const current = await rpcRequest<SharedSettingsPayload>("settings.get");
      const hint = current?.summarize_hint ?? {};
      const enabled = hint.enabled !== false;
      const levels = `${hint.level1 ?? 50}/${hint.level2 ?? 75}`;
      return picker({
        title: `Summarize hints — now ${enabled ? `on (${levels}%)` : "off"}`,
        items: [
          { label: "On (default levels)", description: "Hint at 50% and 75% of context budget", value: "on", active: enabled && hint.level1 === undefined },
          { label: "Custom levels…", description: "Pick the two trigger percentages", value: "custom" },
          { label: "Off", description: "No summarize hints", value: "off", active: !enabled },
        ],
        onSelect: async (v) => {
          if (v === "off") {
            await rpcRequest("settings.patch", { summarize_hint: { enabled: false } });
            return;
          }
          if (v === "on") {
            await rpcRequest("settings.patch", { summarize_hint: { enabled: true } });
            return;
          }
          return input({
            title: "Trigger levels (two percentages, e.g. 50 75)",
            placeholder: "50 75",
            initial: `${hint.level1 ?? 50} ${hint.level2 ?? 75}`,
            onSubmit: async (text) => {
              const m = text.trim().match(/^(\d{1,2})\s+(\d{1,2})$/);
              if (!m) {
                textCard("Summarize hints", "Expected two numbers like: 50 75");
                return;
              }
              await rpcRequest("settings.patch", {
                summarize_hint: { enabled: true, level1: Number(m[1]), level2: Number(m[2]) },
              });
            },
          });
        },
      });
    },
  },
  {
    name: "/help",
    description: "Commands and shortcuts",
    group: "Info",
    run: () => addCard({ kind: "help" }),
  },
];

function skillCommands(skills: SkillInfo[]): SlashCommand[] {
  if (!hasCapability("invokeSkill")) return [];
  return skills
    .filter((s) => s.userInvocable && s.enabled)
    .map((s) => ({
      name: `/${s.name}`,
      description: s.description,
      group: "Skills" as const,
      run: () =>
        input({
          title: `/${s.name}`,
          placeholder: "Arguments (optional) — Enter to run",
          allowEmpty: true,
          onSubmit: async (args) => {
            await rpcRequest("session.invokeSkill", { name: s.name, args: args.trim() });
          },
        }),
    }));
}

/** Full command list for the current session state. */
export function buildCommands(): SlashCommand[] {
  const builtinNames = new Set(builtinCommands.map((c) => c.name));
  const dynamic = skillCommands(state().skills).filter((c) => !builtinNames.has(c.name));
  return [...builtinCommands, ...dynamic];
}

/** Prefix filter, mirroring the TUI's completion behavior. */
export function filterCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
  return filterByPrefix(commands, filter);
}
