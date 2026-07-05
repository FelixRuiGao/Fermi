/**
 * Extension ⇄ core type surface.
 *
 * All wire-protocol types come from the core's single source of truth
 * (src/protocol) — never re-declare them here; drift between hand-mirrored
 * copies is exactly the class of bug that module exists to kill. Only
 * extension-local types (webview messaging, raw-log mirror) live below.
 */

export type {
  // Handshake
  PermissionMode,
  ProtocolCapability,
  SessionMetaPayload as SessionMeta,
  SessionStatusPayload as SessionStatus,
  // Conversation projection
  ConversationEntry,
  ConversationEntryKind,
  // Asks
  AskKind,
  AskSource,
  AgentQuestionOptionKind,
  AgentQuestionOption,
  AgentQuestionItem,
  AgentQuestionAnswer,
  AgentQuestionDecision,
  ApprovalAskPayload as ApprovalPayload,
  PendingAskUi as AskPayload,
  // Plan
  CheckpointStatus,
  PlanCheckpoint,
  // Sessions / models / skills
  SessionListItem,
  ModelDescriptor,
  SkillInfo,
  ForkSessionPayload,
  // Context management
  RewindTarget,
  SummarizeTarget,
  // Background shells
  BackgroundShellSnapshot as ShellSnapshot,
  BackgroundShellDetail as ShellDetail,
  // Child sessions
  ChildSessionSnapshot,
  ChildSessionLifecycle,
  // Control plane
  McpStatusPayload,
  HooksStatusPayload,
  ModelTierStatusPayload,
  ModelTierLevel,
  ThinkingLevelsPayload,
  SharedSettingsPayload,
  // Init wizard
  ProviderPresetInfo,
  ConfigStatus,
  ModelPickerNode,
} from "../../src/protocol/index.js";

/**
 * Raw log entry mirror for the legacy getLogSnapshot fallback (pre-Phase-3
 * binaries). Not part of the blessed remote protocol; the modern path is
 * the ConversationEntry projection.
 */
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

// ── Extension-local webview messaging ──

export type ExtToWebviewMessage =
  | { type: "rpc-response"; id: number; result?: unknown; error?: string }
  | { type: "event"; method: string; params?: unknown }
  | { type: "file-context"; filePath: string; selection?: string };

export type WebviewToExtMessage =
  | { type: "rpc"; id: number; method: string; params?: unknown }
  | { type: "ready" };
