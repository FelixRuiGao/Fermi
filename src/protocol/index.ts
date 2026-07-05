/**
 * Fermi wire protocol — the single source of truth for every type that
 * crosses the `fermi --server` NDJSON boundary.
 *
 * RULES
 * - This module is fully self-contained: no imports, no runtime code.
 *   Remote clients (VS Code webview, future GUI renderer) import it
 *   directly; core modules re-export from here instead of re-declaring.
 * - Additive changes only. Renaming or removing a field is a breaking
 *   protocol change and needs a new capability (or a protocolVersion bump).
 * - Capability strings gate feature families so old client/binary pairs
 *   degrade gracefully; see PROTOCOL_CAPABILITY docs below.
 */

// ─────────────────────────────────────────────────────────────────────────
// Handshake
// ─────────────────────────────────────────────────────────────────────────

/** Known capability strings advertised in the ready meta. */
export type ProtocolCapability =
  | "projectedLog"
  | "askEvents"
  | "turnLifecycle"
  | "waitingStatus"
  | "crashEvent"
  | "injectedTurn"
  | "invokeSkill"
  | "thinkingLevel"
  | "mcpControl"
  | "hooksControl"
  | "sharedSettings"
  | "watchEvents"
  | "childMeta"
  | "modelCatalog"
  | "turnAttachments";

export type PermissionMode = "read_only" | "reversible" | "yolo";

/** `ready` event payload / session.getMeta result. */
export interface SessionMetaPayload {
  readonly sessionId: string;
  readonly title: string | undefined;
  readonly displayName: string;
  readonly sessionDir: string | null;
  readonly workDir: string;
  readonly modelConfigName: string;
  readonly modelProvider: string;
  /**
   * Clean display label for the current model (describeModel's modelLabel),
   * so clients show "Claude Haiku 4.5" instead of a raw runtime config name.
   * Optional for older-binary compatibility.
   */
  readonly modelDisplayLabel?: string;
  readonly thinkingLevel: string;
  readonly accentColor: string | undefined;
  readonly turnCount: number;
  readonly protocolVersion: number;
  readonly capabilities: readonly string[];
}

/** session.getStatus result / log.changed status field. */
export interface SessionStatusPayload {
  readonly currentTurnRunning: boolean;
  readonly sessionPhase: string;
  readonly lastTurnEndStatus: string | null;
  readonly pendingInboxCount: number;
  readonly lifetimeToolCallCount: number;
  readonly lastToolCallSummary: string;
  readonly lastInputTokens: number;
  readonly lastTotalTokens: number;
  readonly lastCacheReadTokens: number;
  readonly contextBudget: number;
  readonly activeLogEntryId: string | null;
  readonly hasPendingTurn: boolean;
  readonly permissionMode: PermissionMode;
}

// ─────────────────────────────────────────────────────────────────────────
// Conversation projection (session.getProjectedLog / getProjectedChildLog)
// ─────────────────────────────────────────────────────────────────────────

export type ConversationEntryKind =
  | "user"
  | "agent_result"
  | "assistant"
  | "interrupted_marker"
  | "progress"
  | "sub_agent_rollup"
  | "sub_agent_done"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "status"
  | "error"
  | "compact_mark";

export interface ConversationEntry {
  kind: ConversationEntryKind;
  text: string;
  startedAt?: number;
  elapsedMs?: number;
  id?: string;
  queued?: boolean;
  dim?: boolean;
  meta?: Record<string, unknown>;
  /** Full untruncated result text for preview/detail entries. */
  fullText?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Asks (ask.pending payloads)
// ─────────────────────────────────────────────────────────────────────────

export type AskKind = "agent_question" | "approval";

export interface AskSource {
  agentId: string;
  agentName?: string;
  toolName?: string;
  turnId?: string;
}

export type AgentQuestionOptionKind = "normal" | "custom_input" | "discuss_further";

export interface AgentQuestionOption {
  label: string;
  description?: string;
  kind: AgentQuestionOptionKind;
  systemAdded?: boolean;
}

export interface AgentQuestionItem {
  question: string;
  options: AgentQuestionOption[];
}

export interface AgentQuestionAnswer {
  questionIndex: number;
  selectedOptionIndex: number;
  answerText: string;
  /** Optional user note attached to any answer. */
  note?: string;
}

export interface AgentQuestionDecision {
  answers: AgentQuestionAnswer[];
}

/** ApprovalRequest["payload"] as it appears on the wire. */
export interface ApprovalAskPayload {
  toolCallId: string;
  toolName: string;
  toolSummary: string;
  permissionClass: string;
  offers: Array<{
    type: string;
    label: string;
    scope?: string;
    rule?: Record<string, unknown>;
  }>;
  /** Warning shown before persistent rule options (dim text, not selectable). */
  persistentWarning?: string;
}

/** The wire shape of ask.pending events / session.getPendingAsk results. */
export interface PendingAskUi {
  id: string;
  kind: AskKind;
  createdAt: string;
  summary: string;
  source: AskSource;
  payload: Record<string, unknown>;
  options: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Plan checklist (plan.changed / session.getPlanState)
// ─────────────────────────────────────────────────────────────────────────

export type CheckpointStatus = "pending" | "active" | "done";

export interface PlanCheckpoint {
  /** Full text of the checkbox line (without the `- [.] ` prefix). */
  text: string;
  status: CheckpointStatus;
}

// ─────────────────────────────────────────────────────────────────────────
// Sessions / models / skills
// ─────────────────────────────────────────────────────────────────────────

/** session.listProjectSessions items (SessionStore.listSessions). */
export interface SessionListItem {
  sessionId: string;
  path: string;
  created: string;
  lastActiveAt: string;
  summary: string;
  title?: string;
  turns: number;
}

/** session.listAvailableModels items. */
export interface ModelDescriptor {
  name: string;
  provider: string;
  model: string;
  contextLength: number;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
  /**
   * Thinking levels eligible for this model when pinned to a sub-agent tier
   * (session.listAvailableModels enriches each entry). Optional for
   * older-binary compatibility.
   */
  tierThinkingLevels?: readonly string[];
}

/**
 * session.getModelCatalog: the grouped model picker tree the TUI shows,
 * serialized for out-of-process clients. Nodes carry human labels
 * (describeModel), grouping (group → provider → vendor → model), and
 * credential state so the UI can render a hierarchy with clean names instead
 * of the flat raw-config-name list. `value` is what session.selectModel
 * accepts (a config name or provider:selectionKey).
 */
export type ModelCatalogNodeKind = "group" | "provider" | "vendor" | "model";
export type ModelCredentialState =
  | "configured"
  | "missing"
  | "oauth_missing"
  | "not_required";

export interface ModelCatalogNode {
  readonly kind: ModelCatalogNodeKind;
  readonly id: string;
  readonly value: string;
  /** Clean, human-readable label (e.g. "Claude Haiku 4.5", "Anthropic"). */
  readonly label: string;
  /** Variant / extra qualifier (e.g. a long-context "1m" note). */
  readonly note?: string;
  /** Provider brand label, for section headers in flattened views. */
  readonly brandLabel?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  /** Context window in tokens, when known (model leaves only). */
  readonly contextLength?: number;
  readonly isCurrent: boolean;
  readonly credentialState: ModelCredentialState;
  /** Short hint when a credential is missing (e.g. "key missing: run fermi init"). */
  readonly credentialHint?: string;
  readonly keyMissing: boolean;
  readonly children?: readonly ModelCatalogNode[];
}

/** session.listSkills items. */
export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  userInvocable: boolean;
}

/** session.fork result. */
export interface ForkSessionPayload {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly title: string;
  readonly sourceSessionId: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Context management pickers
// ─────────────────────────────────────────────────────────────────────────

/** session.getRewindTargets items. */
export interface RewindTarget {
  turnIndex: number;
  entryIndex: number;
  preview: string;
  timestamp: number;
  fileCount: number;
  additions: number;
  deletions: number;
  filesReverted: boolean;
}

/** session.getSummarizeTargets items. */
export interface SummarizeTarget {
  kind: "turn" | "summary";
  turnIndex: number;
  preview: string;
  timestamp: number;
  contextId?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Background shells
// ─────────────────────────────────────────────────────────────────────────

export interface BackgroundShellSnapshot {
  id: string;
  command: string;
  cwd: string;
  status: "running" | "exited" | "failed" | "killed";
  exitCode: number | null;
  /** Seconds since the shell was started. */
  elapsedSeconds: number;
  /** Last few output lines (trimmed, newest last). */
  recentOutput: string[];
  logPath: string;
}

export interface BackgroundShellDetail extends BackgroundShellSnapshot {
  /** Tail of the log file (up to the requested size). */
  logTail: string;
  /** True when the log was longer than the tail window. */
  logTruncated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Child sessions (session.getChildSnapshots / child.changed)
// ─────────────────────────────────────────────────────────────────────────

export type ChildSessionMode = "oneshot" | "persistent";
export type ChildSessionLifecycle = "running" | "blocked" | "idle" | "archived";
export type ChildSessionPhase = "idle" | "thinking" | "tool_calling" | "generating" | "waiting";
export type ChildSessionOutcome = "none" | "completed" | "interrupted" | "error";

export interface ChildSessionSnapshot {
  id: string;
  numericId: number;
  logRevision: number;
  template: string;
  mode: ChildSessionMode;
  lifecycle: ChildSessionLifecycle;
  phase: ChildSessionPhase;
  outcome: ChildSessionOutcome;
  running: boolean;
  lifetimeToolCallCount: number;
  lastTotalTokens: number;
  lastToolCallSummary: string;
  recentEvents: string[];
  pendingInboxCount: number;
  lastActivityAt: number;
  inputTokens: number;
  contextBudget: number;
  modelConfigName: string;
  modelProvider: string;
  modelDisplayLabel?: string;
  pendingAskId?: string | null;
  pendingAskKind?: AskKind | null;
  activeLogEntryId: string | null;
  turnElapsed: number;
  cacheReadTokens: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Runtime diagnostics / control plane
// ─────────────────────────────────────────────────────────────────────────

export interface McpStatusPayload {
  readonly configured: boolean;
  readonly error: string | null;
  readonly toolCount: number;
  readonly servers: readonly {
    readonly name: string;
    readonly state: string | null;
    readonly error: string | null;
    readonly tools: readonly string[];
    /** Present when the server exists in settings but is disabled (capability "mcpControl"). */
    readonly disabled?: boolean;
  }[];
}

export interface HooksStatusPayload {
  readonly available: boolean;
  readonly hooks: readonly {
    readonly name: string;
    readonly scope: string;
    readonly event: string;
    readonly matcher: string | null;
    readonly command: string;
    readonly failClosed: boolean;
    /** Present on disk-backed listings (capability "hooksControl"). */
    readonly disabled?: boolean;
  }[];
}

export type ModelTierLevel = "high" | "medium" | "low";

export interface ModelTierStatusPayload {
  readonly tiers: readonly {
    readonly level: ModelTierLevel;
    readonly provider: string | null;
    readonly selectionKey: string | null;
    readonly modelId: string | null;
    readonly thinkingLevel: string | null;
    readonly configName: string | null;
    readonly label: string;
  }[];
}

/** session.getThinkingLevels result (capability "thinkingLevel"). */
export interface ThinkingLevelsPayload {
  readonly levels: readonly string[];
  readonly current: string;
}

/** settings.get / settings.patch payload (capability "sharedSettings"). */
export interface SharedSettingsPayload {
  auto_update?: boolean | "notify";
  summarize_hint?: {
    enabled?: boolean;
    level1?: number;
    level2?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Init wizard
// ─────────────────────────────────────────────────────────────────────────

export interface ProviderPresetInfo {
  id: string;
  name: string;
  envVar: string;
  configured: boolean;
  isOAuth: boolean;
  isLocal: boolean;
  isManaged: boolean;
  models: Array<{ key: string; id: string; label: string }>;
}

export interface ConfigStatus {
  configured: boolean;
  hasProviders: boolean;
  providers: ProviderPresetInfo[];
}

export interface ModelPickerNode {
  id: string;
  label: string;
  value?: string;
  children?: ModelPickerNode[];
}
