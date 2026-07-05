/**
 * RPC method bindings for Session.
 *
 * Maps a curated subset of `Session` methods/properties to JSON-RPC method
 * names. Each binding takes raw `params` (as JSON value) and returns a
 * JSON-serializable result.
 *
 * Also subscribes to Session log/state changes and emits events to the peer.
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { RpcServer } from "./rpc-transport.js";
import type { Session, InlineImageInput } from "../session.js";
import type { LogEntry } from "../log-entry.js";
import type { PermissionMode } from "../permissions/index.js";
import { projectToTuiEntries } from "../log-projection.js";
import { randomSessionId, saveGlobalSettingsPatch, saveLog, SessionStore, type AgentModelEntry, type ModelTierEntry } from "../persistence.js";
import { applySessionRestore } from "../session-resume.js";
import { getContextLength, getTierEligibleThinkingLevels, getThinkingLevels } from "../config.js";
import { createModelTierEntry, resolveModelSelection } from "../model-selection.js";
import { buildModelPickerTree, type ModelPickerTreeNode } from "../model-picker-tree.js";
import { describeModel } from "../model-presentation.js";
import { AGENT_MODES, isAgentMode } from "../modes/index.js";
import { resolveSkillContent } from "../skills/loader.js";
import { getAllMcpServerNames, setMcpServerDisabled } from "../mcp-settings.js";
import { loadAllHooksFromDisk, setHookDisabled, reloadHooksIntoRuntime } from "../hooks/manage.js";
import { loadGlobalSettings } from "../persistence.js";
import { validateSummarizeHintLevels } from "../settings.js";
import { InitService } from "../init-service.js";
import { loadDotenv } from "../dotenv.js";
import { getFermiHomeDir } from "../home-path.js";
import type {
  SessionMetaPayload as MetaPayload,
  SessionStatusPayload as StatusPayload,
  McpStatusPayload,
  HooksStatusPayload,
  ForkSessionPayload,
  ModelTierStatusPayload,
  ModelTierLevel,
  SharedSettingsPayload,
  ModelCatalogNode,
} from "../protocol/index.js";

export interface SessionRpcOptions {
  readonly session: Session;
  readonly server: RpcServer;
  readonly sessionDir: string | null;
  readonly workDir: string;
  /** Called when the server has fully shut down. */
  readonly onShutdown: () => Promise<void>;
}

/** A snapshot of a log entry suitable for JSON serialization. */
type SerializedLogEntry = LogEntry;

/**
 * Wire-protocol version, advertised in the `ready` meta. Bump when an event
 * payload or method contract changes incompatibly. Capability strings let
 * clients feature-detect additive surface without version arithmetic.
 */
export const PROTOCOL_VERSION = 1;
export const PROTOCOL_CAPABILITIES = [
  /** session.getProjectedLog / session.getProjectedChildLog */
  "projectedLog",
  /** ask.pending / ask.resolved driven by a real runtime subscription (child asks included) */
  "askEvents",
  /** turn.started / turn.ended emitted by the runtime for ALL turns (incl. auto-resume) */
  "turnLifecycle",
  /** turn.ended may carry status "waiting" (turn parked on a pending ask) */
  "waitingStatus",
  /** server.crashed emitted on fatal process errors */
  "crashEvent",
  /** session.runInjectedTurn (displayText ≠ content turns, e.g. /review) */
  "injectedTurn",
  /** session.invokeSkill (user-invocable skill slash commands) */
  "invokeSkill",
  /** session.getThinkingLevels / setThinkingLevel + thinking.changed */
  "thinkingLevel",
  /** session.setMcpServerEnabled / reconnectMcpServer / reloadMcp + mcp.changed */
  "mcpControl",
  /** session.setHookEnabled / reloadHooks + hooks.changed (disk-backed getHooksStatus) */
  "hooksControl",
  /** settings.get / settings.patch + settings.changed */
  "sharedSettings",
  /** child.changed / shells.changed push events (in-process watcher) */
  "watchEvents",
  /** sub_agent_done projection entries carry subAgentId/subAgentName meta */
  "childMeta",
  /** session.getModelCatalog (grouped model tree) + selectModel accepts preset provider:model + meta.modelDisplayLabel */
  "modelCatalog",
  /** session.submitTurn accepts an `attachments` array of inline images */
  "turnAttachments",
  /** provider.* — add/configure providers, set keys, OAuth login in session mode */
  "providerControl",
] as const;

interface SessionStoreAccess {
  _store?: {
    sessionDir?: string;
  };
}

const PERMISSION_MODES = new Set<PermissionMode>(["read_only", "reversible", "yolo"]);
const MODEL_TIER_LEVELS: readonly ModelTierLevel[] = ["high", "medium", "low"];

interface AgentRuntimeSettingsPayload {
  readonly subAgentInheritMcp: boolean;
  readonly subAgentInheritHooks: boolean;
  readonly agentModelPins: number;
}

interface AgentModelPinsPayload {
  readonly templates: readonly {
    readonly name: string;
    readonly description: string | null;
    readonly provider: string | null;
    readonly selectionKey: string | null;
    readonly modelId: string | null;
    readonly thinkingLevel: string | null;
    readonly configName: string | null;
    readonly label: string;
  }[];
}

function currentModelDisplayLabel(s: Session): string {
  const mc = s.primaryAgent?.modelConfig;
  if (!mc?.model) return s.currentModelConfigName ?? "";
  try {
    return describeModel({
      configName: s.currentModelConfigName ?? undefined,
      providerId: mc.provider,
      selectionKey: mc.model,
      modelId: mc.model,
    }).modelLabel;
  } catch {
    return s.currentModelConfigName ?? "";
  }
}

export function buildMeta(s: Session, workDir: string, sessionDir: string | null): MetaPayload {
  return {
    sessionId: sessionDir ? basename(sessionDir) : s.createdAt,
    title: s.getTitle(),
    displayName: s.getDisplayName(),
    sessionDir,
    workDir,
    modelConfigName: s.currentModelConfigName ?? "",
    modelProvider: s.primaryAgent?.modelConfig?.provider ?? "",
    modelDisplayLabel: currentModelDisplayLabel(s),
    thinkingLevel: s.thinkingLevel ?? "none",
    accentColor: s.accentColor,
    turnCount: s.turnCount,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: PROTOCOL_CAPABILITIES,
  };
}

function buildStatus(s: Session): StatusPayload {
  return {
    // The wire field drives client spinners/stop buttons, so it reports
    // `turnActive` (lifecycle started↔ended pairing), NOT the turn lock:
    // the lock is also held by non-turn operations and — worse — is still
    // held when the final coalesced log.changed snapshot is taken after
    // `turn.ended` was emitted, which used to strand clients on a stale
    // currentTurnRunning=true forever. Lock-based gating (fork/restore)
    // keeps using session.currentTurnRunning directly.
    currentTurnRunning: s.turnActive,
    sessionPhase: s.sessionPhase,
    lastTurnEndStatus: s.lastTurnEndStatus,
    pendingInboxCount: s.pendingInboxCount,
    lifetimeToolCallCount: s.lifetimeToolCallCount,
    lastToolCallSummary: s.lastToolCallSummary,
    lastInputTokens: s.lastInputTokens,
    lastTotalTokens: s.lastTotalTokens,
    lastCacheReadTokens: s.lastCacheReadTokens,
    contextBudget: s.contextBudget,
    activeLogEntryId: s.activeLogEntryId,
    hasPendingTurn: s.hasPendingTurnToResume(),
    permissionMode: s.permissionMode,
  };
}

async function buildMcpStatus(s: Session): Promise<McpStatusPayload> {
  // Settings are the authority on which servers exist (including disabled
  // ones the manager never sees); the manager supplies runtime state.
  const settingsServers = getAllMcpServerNames();
  const disabledEntries = [...settingsServers.entries()]
    .filter(([, cfg]) => cfg.disabled)
    .map(([name]) => ({
      name,
      state: null,
      error: null,
      tools: [] as string[],
      disabled: true,
    }));

  const manager = s.mcpManager;
  if (!manager) {
    return {
      configured: settingsServers.size > 0,
      error: null,
      toolCount: 0,
      servers: disabledEntries,
    };
  }

  try {
    if (typeof s.ensureMcpReady === "function") {
      await s.ensureMcpReady();
    } else if (typeof manager.connectAll === "function") {
      await manager.connectAll();
    }
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : String(err),
      toolCount: 0,
      servers: [],
    };
  }

  const tools = typeof manager.getAllTools === "function" ? manager.getAllTools() : [];
  const statuses = typeof manager.getServerStatuses === "function"
    ? manager.getServerStatuses()
    : [];
  const byServer = new Map<string, string[]>();

  for (const tool of tools) {
    const name = typeof tool.name === "string" ? tool.name : "";
    const parts = name.split("__");
    const server = parts.length >= 3 ? parts[1]! : "unknown";
    const originalName = parts.length >= 3 ? parts.slice(2).join("__") : name;
    const list = byServer.get(server) ?? [];
    if (originalName) list.push(originalName);
    byServer.set(server, list);
  }

  for (const status of statuses) {
    if (!byServer.has(status.name)) byServer.set(status.name, []);
  }

  return {
    configured: true,
    error: null,
    toolCount: tools.length,
    servers: [
      ...[...byServer.entries()].map(([name, serverTools]) => {
        const status = statuses.find((item) => item.name === name);
        return {
          name,
          state: typeof status?.state === "string" ? status.state : null,
          error: typeof status?.error === "string" ? status.error : null,
          tools: [...serverTools].sort(),
        };
      }),
      ...disabledEntries.filter((d) => !byServer.has(d.name)),
    ],
  };
}

function buildHooksStatus(s: Session): HooksStatusPayload {
  // Disk is the authority: includes disabled hooks (the runtime filters them
  // out at setHooks time, so a runtime-based listing can't drive a toggle UI).
  const diskHooks = loadAllHooksFromDisk();
  if (diskHooks.length === 0) {
    return { available: Boolean(s.hookRuntime), hooks: [] };
  }
  return {
    available: true,
    hooks: diskHooks.map((hook) => {
      const matcher = hook.matcher
        ? [
            ...(hook.matcher.toolNames ?? []),
            ...(hook.matcher.agentIds ?? []),
          ].join(", ")
        : "";
      return {
        name: hook.name,
        scope: hook._scope ?? "unknown",
        event: hook.event,
        matcher: matcher.length > 0 ? matcher : null,
        command: `${hook.command}${hook.args?.length ? ` ${hook.args.join(" ")}` : ""}`,
        failClosed: hook.failClosed ?? false,
        ...(hook.disabled === true ? { disabled: true } : {}),
      };
    }),
  };
}

/**
 * Serialize the TUI model picker tree for the wire. Drops "action" nodes
 * (Add provider / Discover / Manage) — those drive credential/discovery flows
 * the out-of-process clients don't implement yet — and enriches model leaves
 * with a known context length so the UI can show "195K".
 */
function serializeCatalogNode(node: ModelPickerTreeNode): ModelCatalogNode {
  const children = node.children
    ?.filter((c) => c.kind !== "action")
    .map(serializeCatalogNode);
  const contextLength = node.kind === "model" && node.modelId
    ? getContextLength(node.modelId)
    : 0;
  return {
    kind: node.kind as ModelCatalogNode["kind"],
    id: node.id,
    value: node.value,
    label: node.label,
    isCurrent: node.isCurrent,
    credentialState: node.credentialState,
    keyMissing: node.keyMissing,
    ...(node.note ? { note: node.note } : {}),
    ...(node.brandLabel ? { brandLabel: node.brandLabel } : {}),
    ...(node.credentialHint ? { credentialHint: node.credentialHint } : {}),
    ...(node.providerId ? { providerId: node.providerId } : {}),
    ...(node.modelId ? { modelId: node.modelId } : {}),
    ...(contextLength > 0 ? { contextLength } : {}),
    ...(children && children.length > 0 ? { children } : {}),
  };
}

function buildModelCatalog(s: Session): ModelCatalogNode[] {
  return buildModelPickerTree({
    session: s,
    includeAddProviderAction: false,
    includeLocalDiscoverActions: false,
  })
    .filter((node) => node.kind !== "action")
    .map(serializeCatalogNode);
}

function buildModelTierStatus(s: Session): ModelTierStatusPayload {
  const tiers = (s.config?.modelTiers ?? {}) as Partial<Record<ModelTierLevel, ModelTierEntry>>;
  return {
    tiers: MODEL_TIER_LEVELS.map((level) => {
      const entry = tiers[level];
      if (!entry) {
        return {
          level,
          provider: null,
          selectionKey: null,
          modelId: null,
          thinkingLevel: null,
          configName: null,
          label: "Inherits main model",
        };
      }
      const configName = typeof s.config?.findModelConfigName === "function"
        ? s.config.findModelConfigName(entry.provider, entry.model_id)
          ?? s.config.findModelConfigName(entry.provider, entry.selection_key)
        : null;
      return {
        level,
        provider: entry.provider,
        selectionKey: entry.selection_key,
        modelId: entry.model_id,
        thinkingLevel: entry.thinking_level,
        configName: configName ?? null,
        label: configName ?? `${entry.provider}:${entry.selection_key || entry.model_id}`,
      };
    }),
  };
}

function buildAgentRuntimeSettings(s: Session): AgentRuntimeSettingsPayload {
  const agentModels = s.config?.agentModels;
  return {
    subAgentInheritMcp: s.config?.subAgentInheritMcp ?? true,
    subAgentInheritHooks: s.config?.subAgentInheritHooks ?? true,
    agentModelPins: agentModels && typeof agentModels === "object"
      ? Object.keys(agentModels).length
      : 0,
  };
}

function buildAgentModelPins(s: Session): AgentModelPinsPayload {
  const pins = (s.config?.agentModels ?? {}) as Record<string, AgentModelEntry>;
  const templates = Object.entries(s.agentTemplates ?? {}).map(([name, agent]) => {
    const entry = pins[name];
    if (!entry) {
      return {
        name,
        description: typeof agent?.description === "string" && agent.description.trim()
          ? agent.description.trim()
          : null,
        provider: null,
        selectionKey: null,
        modelId: null,
        thinkingLevel: null,
        configName: null,
        label: "Uses tier or main model",
      };
    }
    const configName = typeof s.config?.findModelConfigName === "function"
      ? s.config.findModelConfigName(entry.provider, entry.model_id)
        ?? s.config.findModelConfigName(entry.provider, entry.selection_key)
      : null;
    return {
      name,
      description: typeof agent?.description === "string" && agent.description.trim()
        ? agent.description.trim()
        : null,
      provider: entry.provider,
      selectionKey: entry.selection_key,
      modelId: entry.model_id,
      thinkingLevel: entry.thinking_level,
      configName: configName ?? null,
      label: configName ?? `${entry.provider}:${entry.selection_key || entry.model_id}`,
    };
  });
  return { templates: templates.sort((a, b) => a.name.localeCompare(b.name)) };
}

function defaultTierThinkingLevel(modelId: string): string {
  if (getThinkingLevels(modelId).length === 0) return "none";
  const eligible = getTierEligibleThinkingLevels(modelId);
  if (eligible.length === 0) {
    throw new Error(`Model '${modelId}' has no eligible sub-agent thinking levels.`);
  }
  return eligible[eligible.length - 1]!;
}

function expectModelTierLevel(
  params: Record<string, unknown>,
  key: string,
  method: string,
): ModelTierLevel {
  const level = expectString(params, key, method);
  if (!MODEL_TIER_LEVELS.includes(level as ModelTierLevel)) {
    throw new Error(`${method}: '${key}' must be one of high, medium, low`);
  }
  return level as ModelTierLevel;
}

function forkSessionDirectory(sourceDir: string): ForkSessionPayload {
  if (!existsSync(join(sourceDir, "log.json"))) {
    throw new Error("session.fork: cannot fork an empty session");
  }

  const projectDir = dirname(sourceDir);
  const sourceSessionId = basename(sourceDir);
  let newSessionId = randomSessionId();
  let newDir = join(projectDir, newSessionId);
  for (let attempt = 0; existsSync(newDir) && attempt < 8; attempt += 1) {
    newSessionId = randomSessionId();
    newDir = join(projectDir, newSessionId);
  }
  if (existsSync(newDir)) {
    throw new Error("session.fork: failed to allocate a unique session directory");
  }

  try {
    cpSync(sourceDir, newDir, { recursive: true, errorOnExist: true });
  } catch (err) {
    try { rmSync(newDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw new Error(`session.fork: copy failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const nowIso = new Date().toISOString();
    const metaPath = join(newDir, "meta.json");
    const logPath = join(newDir, "log.json");
    const meta = readJsonRecord(metaPath);
    const logData = readJsonRecord(logPath);
    const sourceTitle = firstString(meta.title, logData.title, meta.summary, logData.summary);
    const branchTitle = sourceTitle.startsWith("(branch) ")
      ? sourceTitle
      : `(branch) ${sourceTitle || sourceSessionId}`.trim();

    meta.session_id = newSessionId;
    meta.created_at = nowIso;
    meta.last_active_at = nowIso;
    meta.title = branchTitle;
    meta.forked_from_session_id = sourceSessionId;
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

    logData.session_id = newSessionId;
    logData.created_at = nowIso;
    logData.updated_at = nowIso;
    logData.title = branchTitle;
    logData.forked_from_session_id = sourceSessionId;
    writeFileSync(logPath, `${JSON.stringify(logData, null, 2)}\n`);

    return {
      sessionId: newSessionId,
      sessionDir: newDir,
      title: branchTitle,
      sourceSessionId,
    };
  } catch (err) {
    try { rmSync(newDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw new Error(`session.fork: metadata patch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${basename(filePath)} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function expectObject(params: unknown, method: string): Record<string, unknown> {
  if (params == null) return {};
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new Error(`${method}: params must be an object`);
  }
  return params as Record<string, unknown>;
}

function expectString(params: Record<string, unknown>, key: string, method: string): string {
  const v = params[key];
  if (typeof v !== "string") throw new Error(`${method}: '${key}' must be a string`);
  return v;
}

function optString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

function optNumber(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Normalize a client `attachments` array into the runtime InlineImageInput
 * shape. Accepts either a bare base64 payload or a `data:<type>;base64,...`
 * URL under `base64`/`data`, and a media type under `mediaType`/`mimeType`.
 * Returns undefined when there are no usable images (turn runs text-only).
 */
function parseInlineImages(raw: unknown): InlineImageInput[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const images: InlineImageInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rawData = typeof o["base64"] === "string"
      ? (o["base64"] as string)
      : typeof o["data"] === "string"
        ? (o["data"] as string)
        : "";
    if (!rawData) continue;
    let mediaType = typeof o["mediaType"] === "string"
      ? (o["mediaType"] as string)
      : typeof o["mimeType"] === "string"
        ? (o["mimeType"] as string)
        : "";
    let base64 = rawData;
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(rawData);
    if (m) {
      if (!mediaType) mediaType = m[1]!;
      base64 = m[2]!;
    }
    if (!mediaType) mediaType = "image/png";
    const id = typeof o["id"] === "string" && o["id"]
      ? (o["id"] as string)
      : typeof o["name"] === "string" && o["name"]
        ? (o["name"] as string)
        : `img-${i}`;
    images.push({ id, base64, mediaType });
  }
  return images.length > 0 ? images : undefined;
}

function expectPermissionMode(
  params: Record<string, unknown>,
  key: string,
  method: string,
): PermissionMode {
  const v = expectString(params, key, method);
  if (!PERMISSION_MODES.has(v as PermissionMode)) {
    throw new Error(`${method}: '${key}' must be one of read_only, reversible, yolo`);
  }
  return v as PermissionMode;
}

/**
 * Register all session-related RPC handlers on the given server, and wire
 * up event emission for log changes and state transitions.
 */
export function registerSessionRpc(opts: SessionRpcOptions): { dispose: () => void } {
  const { session, server, workDir, onShutdown } = opts;
  let sessionDir = opts.sessionDir;
  const disposers: Array<() => void> = [];


  const getCurrentSessionDir = (): string | null => {
    const liveDir = (session as unknown as SessionStoreAccess)._store?.sessionDir;
    if (typeof liveDir === "string" && liveDir.length > 0) {
      sessionDir = liveDir;
      return liveDir;
    }
    return sessionDir;
  };

  const saveSessionLog = (): void => {
    const currentDir = getCurrentSessionDir();
    if (!currentDir) return;
    try {
      const { meta, entries } = session.getLogForPersistence();
      if (meta.turnCount === 0) return;
      saveLog(currentDir, meta, [...entries]);
    } catch (err) {
      server.emit("server.stderr", {
        text: `[autosave] ${err instanceof Error ? err.message : String(err)}\n`,
      });
    }
  };

  // ── Lifecycle ──
  server.on("server.hello", () => ({
    name: "fermi-server",
    protocolVersion: PROTOCOL_VERSION,
    capabilities: PROTOCOL_CAPABILITIES,
  }));

  server.on("server.shutdown", async () => {
    // Schedule the shutdown so we can return a response first.
    setImmediate(() => {
      void onShutdown();
    });
    return { ok: true };
  });

  // ── Session metadata ──
  server.on("session.getMeta", () => buildMeta(session, workDir, sessionDir));
  server.on("session.getStatus", () => buildStatus(session));

  server.on("session.listProjectSessions", () => {
    const store = new SessionStore({ projectPath: workDir });
    return store.listSessions();
  });

  server.on("session.restoreSession", (params) => {
    if (session.currentTurnRunning) {
      throw new Error("session.restoreSession: cannot restore while a turn is running");
    }

    const p = expectObject(params, "session.restoreSession");
    const requestedSessionId = expectString(p, "sessionId", "session.restoreSession");
    const store = new SessionStore({ projectPath: workDir });
    const target = store
      .listSessions()
      .find((item) => item.sessionId === requestedSessionId || basename(item.path) === requestedSessionId);

    if (!target) {
      throw new Error(`session.restoreSession: session not found in this workspace: ${requestedSessionId}`);
    }

    const result = applySessionRestore(session, store, target.path);
    if (!result.ok) {
      throw new Error(result.error ?? "session.restoreSession: restore failed");
    }

    sessionDir = target.path;
    const meta = buildMeta(session, workDir, sessionDir);
    server.emit("ready", meta);
    server.emit("log.changed", {
      revision: session.getLogRevision(),
      activeLogEntryId: session.activeLogEntryId,
      status: buildStatus(session),
      restored: true,
    });
    return { ...meta, warnings: result.warnings };
  });

  // ── Log access ──
  server.on("session.getLogRevision", () => session.getLogRevision());

  server.on("session.getLogSnapshot", (params) => {
    const p = expectObject(params, "session.getLogSnapshot");
    const sinceRevision = optNumber(p, "sinceRevision");
    // Always return the full log since we don't track per-entry revision.
    // The `sinceRevision` arg is reserved for future incremental updates.
    void sinceRevision;
    const entries: SerializedLogEntry[] = [...session.log];
    return {
      revision: session.getLogRevision(),
      entries,
      activeLogEntryId: session.activeLogEntryId,
    };
  });

  server.on("session.getChildLog", (params) => {
    const p = expectObject(params, "session.getChildLog");
    const childId = expectString(p, "childId", "session.getChildLog");
    const entries = session.getChildSessionLog(childId);
    return entries ? [...entries] : null;
  });

  // ── Projected log (capability "projectedLog") ──
  // Returns the canonical TUI projection (ConversationEntry[]) computed
  // server-side, so out-of-process UIs render the same conversation the TUI
  // does instead of re-implementing pairing/filtering over raw LogEntry[].
  // The raw-log methods above remain for legacy clients.
  server.on("session.getProjectedLog", () => ({
    revision: session.getLogRevision(),
    activeLogEntryId: session.activeLogEntryId,
    entries: projectToTuiEntries(session.log),
  }));

  server.on("session.getProjectedChildLog", (params) => {
    const p = expectObject(params, "session.getProjectedChildLog");
    const childId = expectString(p, "childId", "session.getProjectedChildLog");
    const entries = session.getChildSessionLog(childId);
    return entries ? projectToTuiEntries(entries) : null;
  });

  server.on("session.getChildSnapshots", () => session.getChildSessionSnapshots());

  server.on("session.getPlanState", () => session.getPlanState());

  // ── Turn submission ──
  // Fire-and-forget: do not block the RPC response on the turn completion.
  // turn.started / turn.ended come from the runtime's turn-lifecycle
  // subscription (bottom of this function), which covers EVERY failure path
  // inside the turn lock (pre-activation failures emit a lone ended(error))
  // as well as turns with no RPC caller (auto-resume, post-approval resume).
  // The catch only consumes the rejection so the server process never hits
  // unhandledRejection.
  const fireAndForgetTurn = (run: () => Promise<unknown>): { ok: true } => {
    void run().catch(() => { /* surfaced by the runtime via log + lifecycle */ });
    return { ok: true };
  };

  server.on("session.submitTurn", (params) => {
    const p = expectObject(params, "session.submitTurn");
    const input = expectString(p, "input", "session.submitTurn");
    const inlineImages = parseInlineImages(p["attachments"]);
    return fireAndForgetTurn(() =>
      session.turn(input, inlineImages ? { inlineImages } : undefined));
  });

  server.on("session.resumePendingTurn", () =>
    fireAndForgetTurn(() => session.resumePendingTurn()));

  // Injected turns: user-visible display text differs from the model-facing
  // content. Backs GUI equivalents of TUI commands like /review.
  server.on("session.runInjectedTurn", (params) => {
    const p = expectObject(params, "session.runInjectedTurn");
    const displayText = expectString(p, "displayText", "session.runInjectedTurn");
    const content = expectString(p, "content", "session.runInjectedTurn");
    return fireAndForgetTurn(() => session.runInjectedCommand(displayText, content));
  });

  server.on("session.invokeSkill", (params) => {
    const p = expectObject(params, "session.invokeSkill");
    const name = expectString(p, "name", "session.invokeSkill");
    const args = optString(p, "args") ?? "";
    const skill = session.getSkillMeta(name);
    if (!skill) throw new Error(`session.invokeSkill: unknown skill '${name}'`);
    if (!skill.userInvocable) throw new Error(`session.invokeSkill: skill '${name}' is not user-invocable`);
    const enabled = session.getAllSkillNames().find((s) => s.name === name)?.enabled ?? false;
    if (!enabled) throw new Error(`session.invokeSkill: skill '${name}' is disabled`);
    const content = resolveSkillContent(skill, args);
    const displayText = args.trim() ? `/${name} ${args.trim()}` : `/${name}`;
    return fireAndForgetTurn(() =>
      session.runInjectedCommand(displayText, `[SKILL: ${name}]\n\n${content}`));
  });

  server.on("session.requestTurnInterrupt", () => session.requestTurnInterrupt());
  server.on("session.cancelCurrentTurn", () => {
    session.cancelCurrentTurn();
    return { ok: true };
  });
  server.on("session.interruptAllChildAgents", () => {
    session.interruptAllChildAgents();
    return { ok: true };
  });
  server.on("session.hasRunningChildAgents", () => session.hasRunningChildAgents());
  server.on("session.denyPendingAsk", () => {
    // Deny-and-continue, like clicking the "Deny" offer: the model must see
    // the denial tool_result to react to it. Deny-and-STOP is a different
    // entry point (session.requestTurnInterrupt handles a pending ask).
    let denied = false;
    resolveThenResume(() => {
      denied = session.denyPendingAsk();
    });
    return { denied };
  });
  server.on("session.getShellReport", () => {
    const getReport = (session as unknown as { _buildShellReport?: () => string })._buildShellReport;
    return typeof getReport === "function" ? getReport.call(session) : "No shells tracked.";
  });
  server.on("session.killAllShells", () => {
    session.killAllShells();
    return { ok: true };
  });

  server.on("session.setPermissionMode", (params) => {
    const p = expectObject(params, "session.setPermissionMode");
    const mode = expectPermissionMode(p, "mode", "session.setPermissionMode");
    session.permissionMode = mode;
    server.emit("permission.changed", { mode });
    return buildStatus(session);
  });

  // ── Ask resolution ──
  server.on("session.getPendingAsk", () => session.getPendingAsk());

  // Resolving a ROOT ask only parks the decision (_pendingTurnState); the
  // runtime deliberately leaves the resume to the caller so the TUI can own
  // its abort controller. Over RPC the server IS that caller: without this,
  // an approval from a remote client left the session suspended forever.
  // The before/after transition check scopes the resume to root asks that
  // THIS resolution parked: child-ask resolutions (routing resumes children
  // itself) must not resurrect a stale root pending state left behind by an
  // earlier deny-and-stop.
  const resolveThenResume = (resolve: () => void): void => {
    const parkedBefore = session.hasPendingTurnToResume();
    resolve();
    if (parkedBefore || !session.hasPendingTurnToResume()) return;
    void session.resumePendingTurn().catch(() => {
      // Failures surface through the runtime's error log entry + lifecycle
      // ended(error) event, same as fire-and-forget turns.
    });
  };

  server.on("session.resolveApprovalAsk", (params) => {
    const p = expectObject(params, "session.resolveApprovalAsk");
    const askId = expectString(p, "askId", "session.resolveApprovalAsk");
    const choiceIndex = optNumber(p, "choiceIndex") ?? 0;
    resolveThenResume(() => session.resolveApprovalAsk(askId, choiceIndex));
    return { ok: true };
  });

  server.on("session.resolveAgentQuestionAsk", (params) => {
    const p = expectObject(params, "session.resolveAgentQuestionAsk");
    const askId = expectString(p, "askId", "session.resolveAgentQuestionAsk");
    const decision = p["decision"] as { answers: unknown[] } | undefined;
    if (!decision || !Array.isArray(decision.answers)) {
      throw new Error("session.resolveAgentQuestionAsk: 'decision.answers' must be an array");
    }
    resolveThenResume(() => session.resolveAgentQuestionAsk(askId, decision as never));
    return { ok: true };
  });

  // ── Model selection ──
  server.on("session.listAvailableModels", () => {
    const cfg = session.config;
    return cfg.modelNames.map((name) => {
      const m = cfg.getModel(name);
      return {
        name,
        provider: m.provider,
        model: m.model,
        contextLength: m.contextLength,
        supportsThinking: m.supportsThinking,
        supportsMultimodal: m.supportsMultimodal,
        tierThinkingLevels: getThinkingLevels(m.model).length === 0
          ? ["none"]
          : getTierEligibleThinkingLevels(m.model),
      };
    });
  });

  server.on("session.selectModel", (params) => {
    const p = expectObject(params, "session.selectModel");
    const name = expectString(p, "name", "session.selectModel");
    // Resolve preset `provider:selectionKey` values the same way the TUI
    // /model does: a known config name resolves to itself; a preset model on
    // an already-authenticated provider gets a runtime config auto-created;
    // an unauthenticated provider throws a helpful message (surfaced as an
    // RPC error the client shows). Without this, switchModel(name) threw for
    // every catalog entry that wasn't already an explicit settings.json config.
    const resolved = resolveModelSelection(session, name);
    session.switchModel(resolved.selectedConfigName);
    server.emit("model.changed", {
      name: resolved.selectedConfigName,
      displayLabel: currentModelDisplayLabel(session),
    });
    // Optional thinking level, applied after the switch (mirrors the TUI's
    // /model → thinking picker chain).
    const thinkingLevel = optString(p, "thinkingLevel");
    if (thinkingLevel) {
      const levels = getThinkingLevels(session.currentModelName ?? "");
      if (levels.includes(thinkingLevel) || thinkingLevel === "off" || thinkingLevel === "none") {
        session.thinkingLevel = thinkingLevel;
        server.emit("thinking.changed", { level: thinkingLevel });
      }
    }
    return buildMeta(session, workDir, sessionDir);
  });

  server.on("session.getModelCatalog", () => buildModelCatalog(session));

  server.on("session.getThinkingLevels", () => ({
    levels: getThinkingLevels(session.currentModelName ?? ""),
    current: session.thinkingLevel ?? "none",
  }));

  server.on("session.setThinkingLevel", (params) => {
    const p = expectObject(params, "session.setThinkingLevel");
    const level = expectString(p, "level", "session.setThinkingLevel");
    const levels = getThinkingLevels(session.currentModelName ?? "");
    if (!levels.includes(level) && level !== "off" && level !== "none") {
      throw new Error(
        `session.setThinkingLevel: '${level}' is not valid for the current model. Available: ${levels.join(", ") || "(none)"}`,
      );
    }
    session.thinkingLevel = level;
    server.emit("thinking.changed", { level });
    return { level };
  });

  server.on("session.setMode", (params) => {
    const p = expectObject(params, "session.setMode");
    const mode = expectString(p, "mode", "session.setMode");
    if (!isAgentMode(mode)) {
      throw new Error(`Unknown mode '${mode}'. Available: ${AGENT_MODES.join(", ")}`);
    }
    session.setMode(mode);
    server.emit("mode.changed", { mode });
    return { mode };
  });

  server.on("session.getMode", () => ({ mode: session.mode ?? "default" }));

  server.on("session.setGoal", (params) => {
    const p = expectObject(params, "session.setGoal");
    const condition = expectString(p, "condition", "session.setGoal");
    session.setGoal(condition);
    return { goal: session.goal ?? null };
  });

  server.on("session.clearGoal", () => {
    session.clearGoal();
    return { goal: null };
  });

  server.on("session.getGoal", () => ({ goal: session.goal ?? null }));

  server.on("session.getModelTiers", () => buildModelTierStatus(session));

  server.on("session.setModelTier", (params) => {
    const p = expectObject(params, "session.setModelTier");
    const level = expectModelTierLevel(p, "level", "session.setModelTier");
    const current = (session.config?.modelTiers ?? {}) as Partial<Record<ModelTierLevel, ModelTierEntry>>;
    const next: Partial<Record<ModelTierLevel, ModelTierEntry>> = { ...current };
    const modelName = p["modelName"];

    if (modelName === null || modelName === undefined || modelName === "") {
      delete next[level];
    } else {
      if (typeof modelName !== "string") {
        throw new Error("session.setModelTier: 'modelName' must be a string or null");
      }
      const modelConfig = session.config.getModel(modelName);
      const thinkingLevel = optString(p, "thinkingLevel")
        ?? defaultTierThinkingLevel(modelConfig.model);
      const entry = createModelTierEntry({
        provider: modelConfig.provider,
        selectionKey: modelConfig.model,
        modelId: modelConfig.model,
      }, thinkingLevel);
      next[level] = entry;
    }

    saveGlobalSettingsPatch({ model_tiers: next });
    const mutableConfig = session.config as unknown as { _modelTiers?: typeof next };
    if (mutableConfig._modelTiers !== undefined) {
      mutableConfig._modelTiers = next;
    }
    server.emit("model.tiers.changed", buildModelTierStatus(session));
    return buildModelTierStatus(session);
  });

  server.on("session.getAgentRuntimeSettings", () => buildAgentRuntimeSettings(session));

  server.on("session.setAgentRuntimeSettings", (params) => {
    const p = expectObject(params, "session.setAgentRuntimeSettings");
    const mutableConfig = session.config as unknown as {
      _subAgentInheritMcp?: boolean;
      _subAgentInheritHooks?: boolean;
    };
    const patch: {
      sub_agent_inherit_mcp?: boolean;
      sub_agent_inherit_hooks?: boolean;
    } = {};

    if (typeof p["subAgentInheritMcp"] === "boolean") {
      patch.sub_agent_inherit_mcp = p["subAgentInheritMcp"];
      if (mutableConfig._subAgentInheritMcp !== undefined) {
        mutableConfig._subAgentInheritMcp = p["subAgentInheritMcp"];
      }
    }
    if (typeof p["subAgentInheritHooks"] === "boolean") {
      patch.sub_agent_inherit_hooks = p["subAgentInheritHooks"];
      if (mutableConfig._subAgentInheritHooks !== undefined) {
        mutableConfig._subAgentInheritHooks = p["subAgentInheritHooks"];
      }
    }

    if (Object.keys(patch).length > 0) saveGlobalSettingsPatch(patch);
    server.emit("agent.runtime.changed", buildAgentRuntimeSettings(session));
    return buildAgentRuntimeSettings(session);
  });

  server.on("session.getAgentModelPins", () => buildAgentModelPins(session));

  server.on("session.setAgentModelPin", (params) => {
    const p = expectObject(params, "session.setAgentModelPin");
    const templateName = expectString(p, "templateName", "session.setAgentModelPin");
    if (!session.agentTemplates?.[templateName]) {
      throw new Error(`session.setAgentModelPin: unknown template '${templateName}'`);
    }

    const current = (session.config?.agentModels ?? {}) as Record<string, AgentModelEntry>;
    const next: Record<string, AgentModelEntry> = { ...current };
    const modelName = p["modelName"];

    if (modelName === null || modelName === undefined || modelName === "") {
      delete next[templateName];
    } else {
      if (typeof modelName !== "string") {
        throw new Error("session.setAgentModelPin: 'modelName' must be a string or null");
      }
      const modelConfig = session.config.getModel(modelName);
      const thinkingLevel = optString(p, "thinkingLevel")
        ?? defaultTierThinkingLevel(modelConfig.model);
      next[templateName] = createModelTierEntry({
        provider: modelConfig.provider,
        selectionKey: modelConfig.model,
        modelId: modelConfig.model,
      }, thinkingLevel);
    }

    saveGlobalSettingsPatch({ agent_models: next });
    const mutableConfig = session.config as unknown as { _agentModels?: typeof next };
    if (mutableConfig._agentModels !== undefined) {
      mutableConfig._agentModels = next;
    }
    server.emit("agent.models.changed", buildAgentModelPins(session));
    return buildAgentModelPins(session);
  });

  // ── Skills ──
  server.on("session.listSkills", () => session.getAllSkillNames());
  server.on("session.setSkillEnabled", (params) => {
    const p = expectObject(params, "session.setSkillEnabled");
    const name = expectString(p, "name", "session.setSkillEnabled");
    const enabled = p["enabled"] === true;
    session.setSkillEnabled(name, enabled);
    const report = session.reloadSkills();
    const disabledSkills = session
      .getAllSkillNames()
      .filter((skill) => !skill.enabled)
      .map((skill) => skill.name);
    try {
      saveGlobalSettingsPatch({
        disabled_skills: disabledSkills.length > 0 ? disabledSkills : undefined,
      });
    } catch {
      // Runtime skill state has already been updated; persistence is best effort.
    }
    server.emit("skills.changed", { skills: session.getAllSkillNames() });
    return { ok: true, report };
  });

  // ── Title ──
  server.on("session.setTitle", (params) => {
    const p = expectObject(params, "session.setTitle");
    const title = expectString(p, "title", "session.setTitle");
    session.setTitle(title);
    saveSessionLog();
    return { ok: true };
  });

  server.on("session.fork", () => {
    if (session.currentTurnRunning) {
      throw new Error("session.fork: cannot fork while a turn is running");
    }
    const childSnapshots = typeof session.getChildSessionSnapshots === "function"
      ? session.getChildSessionSnapshots()
      : [];
    const liveChildren = childSnapshots.filter((child) => (
      child.lifecycle === "running" || child.lifecycle === "blocked"
    ));
    if (liveChildren.length > 0) {
      throw new Error("session.fork: cannot fork while sub-agents are running");
    }

    saveSessionLog();
    const currentDir = getCurrentSessionDir();
    if (!currentDir) {
      throw new Error("session.fork: no active persisted session");
    }
    return forkSessionDirectory(currentDir);
  });

  // ── Runtime diagnostics ──
  server.on("session.getMcpStatus", () => buildMcpStatus(session));
  server.on("session.getHooksStatus", () => buildHooksStatus(session));

  // ── Control plane: MCP / hooks / shared settings ──

  const reloadMcpLocked = (reason: string): Promise<string> =>
    typeof session.reloadMcpFromCommand === "function"
      ? session.reloadMcpFromCommand(reason)
      : session.reloadMcp({ reason });

  server.on("session.reloadMcp", async () => {
    const report = await reloadMcpLocked("the user reloaded MCP configuration");
    server.emit("mcp.changed", await buildMcpStatus(session));
    return { report };
  });

  server.on("session.setMcpServerEnabled", async (params) => {
    const p = expectObject(params, "session.setMcpServerEnabled");
    const name = expectString(p, "name", "session.setMcpServerEnabled");
    const enabled = p["enabled"] === true;
    if (!setMcpServerDisabled(name, !enabled)) {
      throw new Error(`session.setMcpServerEnabled: unknown MCP server '${name}'`);
    }
    let report = "";
    try {
      report = await reloadMcpLocked(
        `the user ${enabled ? "enabled" : "disabled"} MCP server '${name}'`,
      );
    } catch (err) {
      report = `reload failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    const status = await buildMcpStatus(session);
    server.emit("mcp.changed", status);
    return { ok: true, report, status };
  });

  server.on("session.reconnectMcpServer", async (params) => {
    const p = expectObject(params, "session.reconnectMcpServer");
    const name = expectString(p, "name", "session.reconnectMcpServer");
    let ok = false;
    if (typeof session.reconnectMcpServerFromCommand === "function") {
      ok = await session.reconnectMcpServerFromCommand(name);
    } else if (typeof session.reconnectMcpServer === "function") {
      ok = await session.reconnectMcpServer(name);
    } else if (session.mcpManager && typeof session.mcpManager.reconnectServer === "function") {
      ok = await session.mcpManager.reconnectServer(name);
    }
    server.emit("mcp.changed", await buildMcpStatus(session));
    return { ok };
  });

  server.on("session.setHookEnabled", (params) => {
    const p = expectObject(params, "session.setHookEnabled");
    const name = expectString(p, "name", "session.setHookEnabled");
    const enabled = p["enabled"] === true;
    // loadAllHooksFromDisk keeps every scope's copy (no de-dupe). Take the
    // last same-named hook — that's the one the runtime actually uses, since
    // loadHooksMulti lets later scopes (project/workspace) override global.
    const matches = loadAllHooksFromDisk().filter((h) => h.name === name);
    const hook = matches.at(-1);
    if (!hook?._sourcePath) {
      throw new Error(`session.setHookEnabled: hook '${name}' not found on disk`);
    }
    if (!setHookDisabled(hook._sourcePath, !enabled)) {
      throw new Error(`session.setHookEnabled: failed to update ${hook._sourcePath}`);
    }
    reloadHooksIntoRuntime(session);
    const status = buildHooksStatus(session);
    server.emit("hooks.changed", status);
    return status;
  });

  server.on("session.reloadHooks", () => {
    const count = reloadHooksIntoRuntime(session);
    const status = buildHooksStatus(session);
    server.emit("hooks.changed", status);
    return { count, status };
  });

  const readSharedSettings = (): SharedSettingsPayload => {
    const settings = loadGlobalSettings();
    return {
      ...(settings.auto_update !== undefined ? { auto_update: settings.auto_update } : {}),
      ...(settings.summarize_hint !== undefined ? { summarize_hint: settings.summarize_hint } : {}),
    };
  };

  server.on("settings.get", () => readSharedSettings());

  server.on("settings.patch", (params) => {
    const p = expectObject(params, "settings.patch");
    const patch: SharedSettingsPayload = {};
    if ("auto_update" in p) {
      const v = p["auto_update"];
      if (typeof v !== "boolean" && v !== "notify") {
        throw new Error("settings.patch: 'auto_update' must be boolean or \"notify\"");
      }
      patch.auto_update = v;
    }
    if ("summarize_hint" in p) {
      const v = p["summarize_hint"];
      if (!v || typeof v !== "object") {
        throw new Error("settings.patch: 'summarize_hint' must be an object");
      }
      const hint = v as Record<string, unknown>;
      // Field-level merge over the persisted value: saveGlobalSettingsPatch
      // shallow-overwrites the whole key, so a partial patch (e.g. a toggle
      // sending only { enabled }) would otherwise wipe existing level1/level2.
      const merged: NonNullable<SharedSettingsPayload["summarize_hint"]> = {
        ...(loadGlobalSettings().summarize_hint ?? {}),
      };
      if (typeof hint.enabled === "boolean") merged.enabled = hint.enabled;
      if (typeof hint.level1 === "number") merged.level1 = hint.level1;
      if (typeof hint.level2 === "number") merged.level2 = hint.level2;
      // Validate the merged result with the same helper the TUI uses (also
      // rejects non-integers), so both entry points enforce identical rules.
      if (merged.level1 !== undefined && merged.level2 !== undefined) {
        const err = validateSummarizeHintLevels(merged.level1, merged.level2);
        if (err) throw new Error(`settings.patch: ${err}`);
      }
      patch.summarize_hint = merged;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("settings.patch: no recognized keys (auto_update, summarize_hint)");
    }
    saveGlobalSettingsPatch(patch);
    const next = readSharedSettings();
    server.emit("settings.changed", next);
    return next;
  });

  // ── Control plane: provider / credential management (capability
  // "providerControl"). Reuses the init wizard's service so a running session
  // can add providers, set/change keys, and OAuth-login without dropping to
  // init mode. Credentials are written to disk (settings.json + ~/.fermi/.env +
  // state/oauth.json). The running session's Config is fixed at bootstrap, so a
  // newly-added provider/key applies to the NEXT session — the client says so.
  const providerService = new InitService();
  const emitProvidersChanged = (): void => {
    try {
      server.emit("providers.changed", providerService.checkConfigStatus());
    } catch {
      // peer may be gone
    }
  };

  server.on("provider.getConfigStatus", () => providerService.checkConfigStatus());
  server.on("provider.listPresets", () => providerService.listProviderPresets());

  server.on("provider.configureApiKey", (params) => {
    const p = expectObject(params, "provider.configureApiKey");
    const providerId = expectString(p, "providerId", "provider.configureApiKey");
    const apiKey = expectString(p, "apiKey", "provider.configureApiKey");
    const result = providerService.configureApiKeyProvider(providerId, apiKey);
    loadDotenv(getFermiHomeDir());
    emitProvidersChanged();
    return result;
  });

  server.on("provider.configureManaged", (params) => {
    const p = expectObject(params, "provider.configureManaged");
    const providerId = expectString(p, "providerId", "provider.configureManaged");
    const apiKey = expectString(p, "apiKey", "provider.configureManaged");
    const result = providerService.configureManagedProvider(providerId, apiKey);
    loadDotenv(getFermiHomeDir());
    emitProvidersChanged();
    return result;
  });

  server.on("provider.discoverLocal", (params) => {
    const p = expectObject(params, "provider.discoverLocal");
    const providerId = expectString(p, "providerId", "provider.discoverLocal");
    const baseUrl = expectString(p, "baseUrl", "provider.discoverLocal");
    const apiKey = optString(p, "apiKey");
    return providerService.configureLocalProvider(providerId, baseUrl, apiKey);
  });

  server.on("provider.saveLocal", (params) => {
    const p = expectObject(params, "provider.saveLocal");
    const providerId = expectString(p, "providerId", "provider.saveLocal");
    const baseUrl = expectString(p, "baseUrl", "provider.saveLocal");
    const modelId = expectString(p, "modelId", "provider.saveLocal");
    const contextLength = optNumber(p, "contextLength");
    const apiKey = optString(p, "apiKey");
    providerService.saveLocalProvider(providerId, baseUrl, modelId, contextLength, apiKey);
    loadDotenv(getFermiHomeDir());
    emitProvidersChanged();
    return { ok: true };
  });

  server.on("provider.startOAuth", async (params) => {
    const p = expectObject(params, "provider.startOAuth");
    const providerId = expectString(p, "providerId", "provider.startOAuth");
    if (providerId === "openai-codex") {
      const { deviceCodeLogin, saveOAuthTokens, hasOAuthTokens } = await import("../auth/openai-oauth.js");
      if (hasOAuthTokens()) return { status: "already_authenticated", providerId };
      const tokens = await deviceCodeLogin();
      saveOAuthTokens(tokens);
      emitProvidersChanged();
      return { status: "authenticated", providerId };
    }
    if (providerId === "copilot") {
      const { deviceCodeLoginCLI, saveGitHubTokens, hasGitHubTokens } = await import("../auth/github-copilot-oauth.js");
      if (hasGitHubTokens()) return { status: "already_authenticated", providerId };
      const tokens = await deviceCodeLoginCLI();
      saveGitHubTokens(tokens);
      emitProvidersChanged();
      return { status: "authenticated", providerId };
    }
    throw new Error(`provider.startOAuth: unknown OAuth provider: ${providerId}`);
  });

  // ── Manual context commands ──
  server.on("session.summarize", (params) => {
    const p = expectObject(params, "session.summarize");
    const targetContextIds = p["targetContextIds"] as string[] | undefined;
    const focusPrompt = optString(p, "focusPrompt");
    return fireAndForgetTurn(() => session.runManualSummarize({
      targetContextIds: targetContextIds ?? undefined,
      focusPrompt: focusPrompt ?? undefined,
    }));
  });

  server.on("session.compact", (params) => {
    const p = expectObject(params, "session.compact");
    const instruction = optString(p, "instruction");
    return fireAndForgetTurn(() => session.runManualCompact(instruction));
  });

  // ── Background shells (badge / picker / detail tab) ──
  server.on("session.getBackgroundShellSnapshots", () => session.getBackgroundShellSnapshots());
  server.on("session.getBackgroundShellDetail", (params) => {
    const p = expectObject(params, "session.getBackgroundShellDetail");
    const id = optString(p, "id");
    if (!id) throw new Error("session.getBackgroundShellDetail: 'id' is required");
    const maxChars = optNumber(p, "maxChars");
    return session.getBackgroundShellDetail(id, maxChars !== undefined ? { maxChars } : undefined);
  });
  server.on("session.stopBackgroundShell", async (params) => {
    const p = expectObject(params, "session.stopBackgroundShell");
    const id = optString(p, "id");
    if (!id) throw new Error("session.stopBackgroundShell: 'id' is required");
    return { message: await session.stopBackgroundShell(id) };
  });

  // ── Rewind ──
  server.on("session.getRewindTargets", () => session.getRewindTargets());
  server.on("session.rewind", (params) => {
    const p = expectObject(params, "session.rewind");
    const toTurnIndex = optNumber(p, "toTurnIndex");
    if (typeof toTurnIndex !== "number") {
      throw new Error("session.rewind: 'toTurnIndex' must be a number");
    }
    return session.rewindConversation(toTurnIndex);
  });

  // ── Summarize picker support ──
  server.on("session.getSummarizeTargets", () => session.getSummarizeTargets());
  server.on("session.getContextIdsForTurnRange", (params) => {
    const p = expectObject(params, "session.getContextIdsForTurnRange");
    const startTurn = optNumber(p, "startTurn");
    const endTurn = optNumber(p, "endTurn");
    if (typeof startTurn !== "number" || typeof endTurn !== "number") {
      throw new Error("session.getContextIdsForTurnRange: 'startTurn' and 'endTurn' must be numbers");
    }
    return session.getContextIdsForTurnRange(startTurn, endTurn);
  });

  // ── Subscriptions ──
  // Coalesce log change emissions: TUI fires subscribeLog hundreds of times
  // per turn. We schedule a microtask that emits once with the latest revision.
  let pendingLogEmit = false;
  let lastEmittedRevision = -1;
  const onLogChange = (): void => {
    if (pendingLogEmit) return;
    pendingLogEmit = true;
    queueMicrotask(() => {
      pendingLogEmit = false;
      const revision = session.getLogRevision();
      if (revision === lastEmittedRevision) return;
      lastEmittedRevision = revision;
      server.emit("log.changed", {
        revision,
        activeLogEntryId: session.activeLogEntryId,
        status: buildStatus(session),
      });
    });
  };
  const unsubscribeLog = session.subscribeLog(onLogChange);
  disposers.push(unsubscribeLog);

  const onPlanChange = (): void => {
    server.emit("plan.changed", { state: session.getPlanState() });
  };
  const unsubscribePlan = session.subscribePlan(onPlanChange);
  disposers.push(unsubscribePlan);

  // Ask events — driven by the runtime's real ask subscription (capability
  // "askEvents"). Unlike the old log-change polling, this also observes
  // child-session asks, which never touch the root log. The wire events and
  // dedup behavior are unchanged for legacy clients.
  let lastAskId: string | null = null;
  const onAskChange = (): void => {
    const ask = session.getPendingAsk();
    const askId = ask?.id ?? null;
    if (askId !== lastAskId) {
      lastAskId = askId;
      if (ask) server.emit("ask.pending", ask);
      else server.emit("ask.resolved", {});
    }
  };
  const unsubscribeAsk = session.subscribeAsk(onAskChange);
  disposers.push(unsubscribeAsk);

  // Child-session and background-shell watcher. Neither surface has a
  // subscription hook (the TUI itself polls at 250ms on top of subscribeLog),
  // so the server polls in-process and pushes coalesced change events —
  // remote clients stay purely event-driven.
  let lastChildDigest = "";
  let lastShellDigest = "";
  const watchTimer = setInterval(() => {
    try {
      const children = typeof session.getChildSessionSnapshots === "function"
        ? session.getChildSessionSnapshots()
        : [];
      const childDigest = children
        .map((c) => `${c.id}:${c.logRevision}:${c.lifecycle}:${c.phase}:${c.lifetimeToolCallCount}:${c.pendingAskId ?? ""}`)
        .join("|");
      if (childDigest !== lastChildDigest) {
        lastChildDigest = childDigest;
        server.emit("child.changed", { children });
      }

      const shells = typeof session.getBackgroundShellSnapshots === "function"
        ? session.getBackgroundShellSnapshots()
        : [];
      const shellDigest = shells
        .map((sh) => `${sh.id}:${sh.status}:${sh.exitCode ?? ""}`)
        .join("|");
      if (shellDigest !== lastShellDigest) {
        lastShellDigest = shellDigest;
        server.emit("shells.changed", { shells });
      }
    } catch {
      // The watcher must never take the server down.
    }
  }, 500);
  watchTimer.unref?.();
  disposers.push(() => clearInterval(watchTimer));

  // Turn lifecycle — forwarded from the runtime (capability "turnLifecycle").
  // Covers every activation-loop run, including auto-resume and post-approval
  // resume turns that have no RPC caller. Status "waiting" means the turn
  // parked on a pending ask (capability "waitingStatus").
  const unsubscribeLifecycle = session.subscribeTurnLifecycle((event) => {
    if (event.phase === "started") {
      server.emit("turn.started", { turnCount: session.turnCount });
      return;
    }
    server.emit("turn.ended", {
      status: event.status,
      turnCount: session.turnCount,
      ...(event.error !== undefined ? { error: event.error } : {}),
    });
  });
  disposers.push(unsubscribeLifecycle);

  // Save-on-checkpoint: Session expects an external persister.
  session.onSaveRequest = () => {
    const previousDir = sessionDir;
    saveSessionLog();
    if (sessionDir && sessionDir !== previousDir) {
      server.emit("ready", buildMeta(session, workDir, sessionDir));
    }
    server.emit("session.saved", { revision: session.getLogRevision() });
  };

  return {
    dispose: () => {
      for (const d of disposers) {
        try {
          d();
        } catch {
          // ignore
        }
      }
    },
  };
}
