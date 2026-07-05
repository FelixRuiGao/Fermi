/**
 * Shared types for the Fermi GUI ↔ subprocess JSON-RPC.
 *
 * All wire-protocol types come from the core's single source of truth
 * (`src/protocol`) — never re-declare them here; drift between hand-mirrored
 * copies is exactly the class of bug that module exists to kill. Only
 * GUI-local types (Electron IPC transport, git/file/search desktop features
 * the fermi server doesn't own, settings.json read/write) live below.
 *
 * Used by both the Electron main process (which talks to the subprocess) and
 * the renderer (which talks to main via the preload bridge).
 */

// ── Wire protocol (single source) ──
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
  AgentQuestionOption,
  AgentQuestionOptionKind,
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
  ModelCatalogNode,
  ModelCatalogNodeKind,
  ModelCredentialState,
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
  ChildSessionMode,
  ChildSessionLifecycle,
  ChildSessionPhase,
  ChildSessionOutcome,
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
} from '../../src/protocol/index.js'

import type { ModelTierStatusPayload } from '../../src/protocol/index.js'

/** One tier row from the model-tier status payload. */
export type ModelTierInfo = ModelTierStatusPayload['tiers'][number]
export type ModelTierStatus = ModelTierStatusPayload

// ── GUI-local: Electron IPC transport ──

export interface RpcEvent {
  readonly tabId: string
  readonly method: string
  readonly params?: unknown
}

export interface SessionTab {
  readonly tabId: string
  readonly workDir: string
  readonly sessionId: string | null
  readonly title: string | null
  readonly displayName: string | null
  readonly selectedModel: string | null
  readonly modelProvider: string | null
  readonly createdAt: number
  readonly lastActiveAt: number
  readonly status: 'draft' | 'starting' | 'ready' | 'error' | 'closed'
  readonly errorMessage?: string
  /** True when the subprocess is in init-wizard mode (no providers configured). */
  readonly needsInit?: boolean
}

export interface CreateTabInput {
  readonly workDir: string
  readonly selectedModel?: string
  readonly selectedAgent?: string
}

// ── GUI-local: workspace history (Electron reads ~/.fermi/projects) ──

export interface SessionHistoryItem {
  readonly sessionId: string
  readonly path: string
  readonly created: string
  readonly lastActiveAt: string
  readonly summary: string
  readonly title?: string
  readonly turns: number
  readonly pinned: boolean
}

export interface WorkspaceHistoryGroup {
  readonly workDir: string
  readonly slug: string
  readonly createdAt: string
  readonly lastActiveAt: string
  readonly sessions: readonly SessionHistoryItem[]
}

export interface ArchiveSessionInput {
  readonly workDir: string
  readonly sessionId: string
}

export interface SetSessionPinnedInput {
  readonly workDir: string
  readonly sessionId: string
  readonly pinned: boolean
}

// ── GUI-local: workspace file tree / text search (Electron) ──

export interface WorkspaceFileEntry {
  readonly path: string
  readonly size: number
  readonly mtimeMs: number
}

export interface WorkspaceTextSearchInput {
  readonly workDir: string
  readonly query: string
}

export interface WorkspaceTextSearchResult {
  readonly path: string
  readonly line: number
  readonly column: number
  readonly text: string
}

// ── GUI-local: git panel (Electron shells out to git) ──

export interface GitFileChange {
  readonly path: string
  readonly originalPath?: string
  readonly staged: string
  readonly unstaged: string
  readonly stagedAdditions?: number | null
  readonly stagedDeletions?: number | null
  readonly unstagedAdditions?: number | null
  readonly unstagedDeletions?: number | null
}

export interface GitStatus {
  readonly isRepo: boolean
  readonly workDir: string
  readonly root: string | null
  readonly branch: string | null
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  readonly clean: boolean
  readonly files: readonly GitFileChange[]
  readonly error?: string
}

export interface GitFileActionInput {
  readonly workDir: string
  readonly path: string
}

export interface GitBulkActionInput {
  readonly workDir: string
}

export interface GitFileDiffInput {
  readonly workDir: string
  readonly path: string
  readonly staged: boolean
}

// ── GUI-local: settings.json read/write (Electron main; Stage 4 moves the
// credential-mutating paths to backend RPC) ──

export interface SettingsSnapshot {
  readonly autoUpdate: boolean
  readonly settingsPath: string
  readonly providers: readonly ProviderSettingsItem[]
  readonly defaultModel: string | null
  readonly thinkingLevel: string | null
  readonly permissionMode: string | null
}

export interface ProviderSettingsItem {
  readonly id: string
  readonly kind: 'cloud' | 'local' | 'invalid'
  readonly apiKeyEnv: string | null
  readonly hasEnvValue: boolean
  readonly baseUrl: string | null
  readonly model: string | null
  readonly contextLength: number | null
  readonly hasInlineKey: boolean
}

export interface McpServerInput {
  readonly name: string
  readonly previousName?: string
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Record<string, string>
  readonly url?: string
}

export interface SettingsDefaultsPatch {
  readonly defaultModel?: string | null
  readonly thinkingLevel?: string | null
  readonly permissionMode?: string | null
}

// ── GUI-local: agent runtime settings (session-rpc payloads not yet promoted
// to the protocol module; used by the settings dialog) ──

export interface AgentRuntimeSettings {
  readonly subAgentInheritMcp: boolean
  readonly subAgentInheritHooks: boolean
  readonly agentModelPins: number
}

export interface AgentModelPinInfo {
  readonly name: string
  readonly description: string | null
  readonly provider: string | null
  readonly selectionKey: string | null
  readonly modelId: string | null
  readonly thinkingLevel: string | null
  readonly configName: string | null
  readonly label: string
}

export interface AgentModelPinsStatus {
  readonly templates: readonly AgentModelPinInfo[]
}
