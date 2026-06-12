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

export interface AskPayload {
  id: string;
  kind: string;
  summary: string;
  toolName?: string;
  command?: string;
  questions?: unknown[];
  choices?: Array<{ label: string; description?: string }>;
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
  lastActive?: string;
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
