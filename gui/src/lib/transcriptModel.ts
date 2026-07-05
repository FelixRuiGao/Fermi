/**
 * Pure view-model logic for the transcript — no DOM, no store, no api imports.
 * Adapts the server-projected ConversationEntry[] into render-ready blocks
 * (prose vs collapsed work runs), tool-call views, live-activity views, and
 * model-catalog helpers. Ported from the VSCode webview's model.ts so both
 * clients fold "Worked · N steps" identically.
 */

import type { ChildSessionSnapshot, ConversationEntry, ModelCatalogNode } from '@shared/rpc.js'

// ── Diff data (mirrors src/diff-hunk.ts) ──

export interface DiffHunkData {
  startLine: number
  contextBefore: string[]
  deletions: string[]
  additions: string[]
  contextAfter: string[]
}

export interface FileModifyDisplay {
  filePath: string
  language?: string
  mode: 'replace' | 'append' | 'write'
  totalLineCount: number
  hunks: DiffHunkData[]
  writeLines?: string[]
}

export function normalizeFileModify(raw: unknown): FileModifyDisplay | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.filePath !== 'string' || !d.filePath) return null
  return {
    filePath: d.filePath,
    language: typeof d.language === 'string' ? d.language : undefined,
    mode: d.mode === 'append' || d.mode === 'write' ? d.mode : 'replace',
    totalLineCount: typeof d.totalLineCount === 'number' ? d.totalLineCount : 0,
    hunks: Array.isArray(d.hunks) ? (d.hunks as DiffHunkData[]) : [],
    writeLines: Array.isArray(d.writeLines) ? (d.writeLines as string[]) : undefined,
  }
}

export function diffStats(d: FileModifyDisplay): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const h of d.hunks) {
    added += h.additions?.length ?? 0
    removed += h.deletions?.length ?? 0
  }
  if (added === 0 && removed === 0 && d.writeLines) added = d.writeLines.length
  return { added, removed }
}

// ── Tool call views ──

export interface ToolCallView {
  key: string
  toolName: string
  summary: string
  filePath: string | null
  fileModify: FileModifyDisplay | null
  resultText: string
  isError: boolean
  pending: boolean
}

export function summarizeArgs(toolName: string, args: Record<string, unknown> | undefined): string {
  if (!args) return ''
  if ((toolName === 'bash' || toolName === 'shell') && typeof args.command === 'string') {
    return args.command.length > 120 ? args.command.slice(0, 120) + '…' : args.command
  }
  if (typeof args.file_path === 'string') return args.file_path
  if (typeof args.path === 'string') return args.path
  if (typeof args.query === 'string') return args.query
  if (typeof args.pattern === 'string') return args.pattern
  if (typeof args.url === 'string') return args.url
  return ''
}

export function argFilePath(toolName: string, args: Record<string, unknown> | undefined): string | null {
  if (!args) return null
  if (
    toolName === 'read_file' ||
    toolName === 'write_file' ||
    toolName === 'edit_file' ||
    toolName === 'read' ||
    toolName === 'write' ||
    toolName === 'edit'
  ) {
    if (typeof args.file_path === 'string') return args.file_path
    if (typeof args.path === 'string') return args.path
  }
  return null
}

/** Adapter: server-projected ConversationEntry pair → tool-call view. */
export function toolViewFromProjection(call: ConversationEntry, result?: ConversationEntry): ToolCallView {
  const meta = call.meta ?? {}
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : 'tool'
  const args =
    meta.toolArgs && typeof meta.toolArgs === 'object' ? (meta.toolArgs as Record<string, unknown>) : undefined
  const fileModify = normalizeFileModify(meta.fileModifyData ?? result?.meta?.fileModifyData)
  return {
    key: call.id ?? `${toolName}-${call.startedAt ?? 0}`,
    toolName,
    summary: summarizeArgs(toolName, args) || call.text,
    filePath: fileModify?.filePath ?? argFilePath(toolName, args),
    fileModify,
    resultText: result?.fullText ?? result?.text ?? '',
    isError: result?.meta?.isError === true,
    pending: result === undefined,
  }
}

// ── Transcript blocks (prose vs collapsed work runs) ──

export type WorkItem =
  | { type: 'tool'; view: ToolCallView }
  | { type: 'entry'; entry: ConversationEntry }

export type Block =
  | { type: 'entry'; entry: ConversationEntry }
  | { type: 'work'; items: WorkItem[] }

const WORK_KINDS = new Set(['tool_call', 'reasoning', 'progress', 'sub_agent_rollup', 'sub_agent_done'])

export function isTurnEnd(entry: ConversationEntry): boolean {
  return entry.kind === 'status' && typeof entry.meta?.turnEndStatus === 'string'
}

export function buildBlocks(entries: readonly ConversationEntry[]): Block[] {
  const resultByCallId = new Map<string, ConversationEntry>()
  for (const e of entries) {
    if (e.kind !== 'tool_result') continue
    const callId = e.meta?.toolCallId
    if (typeof callId === 'string') resultByCallId.set(callId, e)
  }

  const blocks: Block[] = []
  let workRun: WorkItem[] | null = null

  const flushWork = (): void => {
    if (workRun && workRun.length > 0) blocks.push({ type: 'work', items: workRun })
    workRun = null
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.kind === 'tool_result') continue

    if (entry.kind === 'tool_call') {
      const callId = entry.meta?.toolCallId
      const result =
        typeof callId === 'string'
          ? resultByCallId.get(callId)
          : entries[i + 1]?.kind === 'tool_result'
            ? entries[i + 1]
            : undefined
      workRun ??= []
      workRun.push({ type: 'tool', view: toolViewFromProjection(entry, result) })
      continue
    }

    if (WORK_KINDS.has(entry.kind)) {
      if (!entry.text.trim() && entry.kind !== 'reasoning') continue
      workRun ??= []
      workRun.push({ type: 'entry', entry })
      continue
    }

    if (entry.kind === 'status' && !isTurnEnd(entry)) {
      if (!entry.text.trim()) continue
      if (workRun) {
        workRun.push({ type: 'entry', entry })
        continue
      }
      blocks.push({ type: 'entry', entry })
      continue
    }

    flushWork()
    blocks.push({ type: 'entry', entry })
  }
  flushWork()
  return blocks
}

// ── Live activity (persistent agents/shells strip above the composer) ──

export interface ChildStatusView {
  id: string
  label: string
  phase: string
  needsApproval: boolean
  toolCount: number
  detail: string
}

const CHILD_PHASE_LABELS: Record<string, string> = {
  idle: 'idle',
  thinking: 'thinking',
  tool_calling: 'running tools',
  generating: 'writing',
  waiting: 'waiting',
}

export function childStatusView(c: ChildSessionSnapshot): ChildStatusView {
  const needsApproval = Boolean(c.pendingAskId)
  return {
    id: c.id,
    label: `#${c.numericId} ${c.template}`,
    phase: needsApproval ? 'needs approval' : CHILD_PHASE_LABELS[c.phase] ?? c.phase,
    needsApproval,
    toolCount: c.lifetimeToolCallCount,
    detail: c.lastToolCallSummary || '',
  }
}

export function isLiveChild(c: ChildSessionSnapshot): boolean {
  return c.lifecycle === 'running' || c.lifecycle === 'blocked'
}

export function liveActivitySummary(agentCount: number, shellCount: number): string {
  const parts: string[] = []
  if (agentCount > 0) parts.push(`${agentCount} agent${agentCount === 1 ? '' : 's'}`)
  if (shellCount > 0) parts.push(`${shellCount} shell${shellCount === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** Trailing lines of an in-flight reasoning stream (char-capped). */
export function thinkingTail(text: string, maxLines = 8, maxChars = 700): string {
  const lines = text.trimEnd().split('\n')
  let tail = lines.slice(-maxLines).join('\n')
  if (tail.length > maxChars) tail = tail.slice(-maxChars)
  return tail
}

// ── Model catalog (grouped picker tree) ──

export interface ModelCatalogSection {
  label: string
  models: ModelCatalogNode[]
}

/**
 * Flatten the nested catalog (group → provider → vendor → model) into
 * provider-labeled sections of model leaves, for a compact dropdown.
 */
export function flattenCatalogSections(nodes: readonly ModelCatalogNode[]): ModelCatalogSection[] {
  const sections: ModelCatalogSection[] = []
  const visit = (list: readonly ModelCatalogNode[], parentLabel: string): void => {
    const models = list.filter((n) => n.kind === 'model')
    if (models.length > 0) sections.push({ label: parentLabel, models })
    for (const node of list) {
      if (node.kind !== 'model' && node.children && node.children.length > 0) {
        visit(node.children, node.label)
      }
    }
  }
  visit(nodes, '')
  return sections
}

/** Depth-first search for a node by its `value` (drill-down resolution). */
export function findCatalogNode(
  nodes: readonly ModelCatalogNode[],
  value: string,
): ModelCatalogNode | undefined {
  for (const node of nodes) {
    if (node.value === value) return node
    if (node.children) {
      const hit = findCatalogNode(node.children, value)
      if (hit) return hit
    }
  }
  return undefined
}

/** Find the model leaf currently marked isCurrent (for the picker trigger). */
export function findCurrentModel(nodes: readonly ModelCatalogNode[]): ModelCatalogNode | undefined {
  for (const node of nodes) {
    if (node.kind === 'model' && node.isCurrent) return node
    if (node.children) {
      const hit = findCurrentModel(node.children)
      if (hit) return hit
    }
  }
  return undefined
}

/** Secondary line for a model leaf: brand · context · (credential hint). */
export function modelLeafDescription(node: ModelCatalogNode): string {
  const parts: string[] = []
  if (node.brandLabel) parts.push(node.brandLabel)
  else if (node.providerId) parts.push(node.providerId)
  if (node.contextLength && node.contextLength > 0) parts.push(`${Math.round(node.contextLength / 1024)}K`)
  if (node.note) parts.push(node.note)
  if (node.keyMissing && node.credentialHint) parts.push(node.credentialHint)
  return parts.join(' · ')
}

// ── Command filtering (prefix match, mirroring the TUI completion) ──

export function filterByPrefix<T extends { name: string }>(commands: T[], filter: string): T[] {
  const f = filter.toLowerCase()
  if (!f || f === '/') return commands
  return commands.filter((c) => c.name.toLowerCase().startsWith(f))
}
