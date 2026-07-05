export interface LogEntry {
  id: string;
  type: string;
  timestamp: number;
  turnIndex: number;
  roundIndex?: number;
  tuiVisible: boolean;
  displayKind: string | null;
  display: string;
  apiRole: string | null;
  content: unknown;
  archived: boolean;
  discarded?: boolean;
  meta: Record<string, unknown>;
}

export interface SessionMeta {
  sessionId: string;
  sessionDir: string | null;
  workDir: string;
  modelConfigName: string;
  modelProvider: string;
  title?: string;
  displayName: string;
  thinkingLevel: string;
  accentColor?: string;
  turnCount: number;
  /** Wire-protocol handshake (absent on pre-Phase-3 binaries). */
  protocolVersion?: number;
  capabilities?: string[];
}

/**
 * Server-side conversation projection (session.getProjectedLog). Mirrors
 * ConversationEntry in src/ui/contracts.ts — the canonical structure all
 * Fermi UIs render. tool_call entries are immediately followed by their
 * tool_result (matched via meta.toolCallId).
 */
export interface ConversationEntry {
  kind:
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

export interface SessionStatus {
  currentTurnRunning: boolean;
  sessionPhase: string;
  lastTurnEndStatus: string | null;
  pendingInboxCount: number;
  lifetimeToolCallCount: number;
  lastToolCallSummary: string;
  lastInputTokens: number;
  lastTotalTokens: number;
  lastCacheReadTokens: number;
  contextBudget: number;
  activeLogEntryId: string | null;
  hasPendingTurn: boolean;
  permissionMode: string;
}

/** Mirrors src/ask.ts PendingAskUi — the wire shape of ask.pending events. */
export interface AskPayload {
  id: string;
  kind: "agent_question" | "approval";
  createdAt: string;
  summary: string;
  source: {
    agentId: string;
    agentName?: string;
    toolName?: string;
    turnId?: string;
  };
  payload: Record<string, unknown>;
  options: string[];
}

/** Mirrors src/ask.ts AgentQuestionItem / AgentQuestionOption. */
export interface AgentQuestionOption {
  label: string;
  description?: string;
  kind: "normal" | "custom_input" | "discuss_further";
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
  note?: string;
}

/** Approval payload (src/ask.ts ApprovalRequest["payload"]). */
export interface ApprovalPayload {
  toolCallId: string;
  toolName: string;
  toolSummary: string;
  permissionClass: string;
  offers: Array<{ type: string; label: string; scope?: string; rule?: Record<string, unknown> }>;
  persistentWarning?: string;
}

export interface ModelDescriptor {
  name: string;
  provider: string;
  model: string;
  contextLength: number;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
}

export interface SessionListItem {
  sessionId: string;
  path: string;
  title?: string;
  summary?: string;
  lastActiveAt?: string;
  turns?: number;
}

/** Mirrors src/plan-state.ts PlanCheckpoint. */
export interface PlanCheckpoint {
  text: string;
  status: "pending" | "active" | "done";
}

/** Mirrors Session.getAllSkillNames() items (userInvocable absent on older binaries). */
export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  userInvocable?: boolean;
}

/** Mirrors Session.getRewindTargets() items. */
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

/** Mirrors Session.getSummarizeTargets() items. */
export interface SummarizeTarget {
  kind: "turn" | "summary";
  turnIndex: number;
  preview: string;
  timestamp: number;
  contextId?: string;
}

/** Mirrors src/background-shell-manager.ts BackgroundShellSnapshot. */
export interface ShellSnapshot {
  id: string;
  command: string;
  cwd: string;
  status: "running" | "exited" | "failed" | "killed";
  exitCode: number | null;
  elapsedSeconds: number;
  recentOutput: string[];
  logPath: string;
}

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

export type ExtToWebviewMessage =
  | { type: "rpc-response"; id: number; result?: unknown; error?: string }
  | { type: "event"; method: string; params?: unknown }
  | { type: "file-context"; filePath: string; selection?: string };

export type WebviewToExtMessage =
  | { type: "rpc"; id: number; method: string; params?: unknown }
  | { type: "ready" };
