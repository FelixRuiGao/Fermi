/**
 * Transcript — renders the SERVER-projected conversation (ConversationEntry[]).
 *
 * The projection already pairs tool_call/tool_result and filters hidden
 * entries, so the client only groups the stream into prose blocks and work
 * runs (buildBlocks) and renders each kind. Rendering strategy (Cursor-like):
 *   - prose (user / assistant / agent_result / error / dividers) renders plainly
 *   - a live work run (trailing, while the turn runs) renders expanded and
 *     streams the tail of the in-flight reasoning
 *   - a completed work run folds its quiet steps into "Worked · N steps",
 *     keeps reasoning as a collapsible "Thought", and ALWAYS renders file
 *     edits inline as diff cards — diffs are never hidden behind a fold.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Copy,
  Check,
  FilePenLine,
  FilePlus,
  FileText,
  FolderSearch,
  Globe,
  ListChecks,
  Search,
  Settings2,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { Markdown } from '@/components/Markdown.js'
import { StructuredDiff } from '@/components/DiffView.js'
import { shortenSummary } from '@/lib/path.js'
import { iconForExtension } from '@/lib/fileIcon.js'
import { useSessionStore } from '@/state/sessionStore.js'
import {
  buildBlocks,
  isTurnEnd,
  thinkingTail,
  type Block,
  type ToolCallView,
  type WorkItem,
} from '@/lib/transcriptModel.js'
import type { ConversationEntry } from '@shared/rpc.js'

interface RenderCtx {
  activeId: string | null
  running: boolean
  workDir?: string
  markdownMode: 'rendered' | 'raw'
  tabId: string
}

export function Transcript({
  entries,
  activeId,
  running,
  workDir,
  markdownMode,
  tabId,
  emptyLabel = null,
}: {
  entries: readonly ConversationEntry[]
  activeId: string | null
  running: boolean
  workDir?: string
  markdownMode: 'rendered' | 'raw'
  tabId: string
  emptyLabel?: string | null
}): JSX.Element {
  const blocks = useMemo(() => buildBlocks(entries), [entries])
  const ctx: RenderCtx = { activeId, running, workDir, markdownMode, tabId }

  const lastIsWork = blocks.length > 0 && blocks[blocks.length - 1]!.type === 'work'
  const liveIndex = running && lastIsWork ? blocks.length - 1 : -1

  if (blocks.length === 0) {
    return (
      <div data-transcript-root className="flex h-full items-center justify-center">
        {emptyLabel && <div className="text-[15px] text-ink-3">{emptyLabel}</div>}
      </div>
    )
  }

  return (
    <div data-transcript-root className="px-6 py-6">
      <div data-transcript-shell className="mx-auto max-w-[840px]">
        {blocks.map((block, i) => renderBlock(block, i, ctx, i === liveIndex))}
        {running && !lastIsWork && <WorkingLine />}
      </div>
    </div>
  )
}

function renderBlock(block: Block, index: number, ctx: RenderCtx, live: boolean): JSX.Element | null {
  if (block.type === 'work') {
    return live ? (
      <LiveRun key={`live-${index}`} items={block.items} ctx={ctx} />
    ) : (
      <CompletedRun key={`work-${blockKey(block, index)}`} items={block.items} ctx={ctx} />
    )
  }

  const entry = block.entry
  const key = entry.id ?? `b-${index}`
  const active = ctx.activeId != null && entry.id === ctx.activeId
  switch (entry.kind) {
    case 'user':
      return <UserBubble key={key} text={entry.text} queued={entry.queued} />
    case 'assistant':
      return <AssistantText key={key} text={entry.text} active={active} markdownMode={ctx.markdownMode} />
    case 'agent_result':
      return <AgentResultRow key={key} entry={entry} ctx={ctx} />
    case 'error':
      return <ErrorRow key={key} text={entry.text} />
    case 'interrupted_marker':
      return <Divider key={key} label={entry.text || 'Interrupted'} />
    case 'compact_mark':
      return <Divider key={key} label={entry.text || 'Context compacted'} />
    case 'status':
      if (isTurnEnd(entry)) return <TurnEndLine key={key} entry={entry} />
      if (!entry.text.trim()) return null
      return <StatusLine key={key} text={entry.text} dim={entry.dim} />
    default:
      return null
  }
}

function blockKey(block: Block, index: number): string {
  const first = block.type === 'work' ? block.items[0] : undefined
  if (first?.type === 'tool') return first.view.key
  if (first?.type === 'entry' && first.entry.id) return first.entry.id
  return String(index)
}

// ── Work runs ──

function isEdit(item: WorkItem): boolean {
  return item.type === 'tool' && item.view.fileModify != null
}

/** A live (in-progress) run: everything expanded; trailing reasoning streams. */
function LiveRun({ items, ctx }: { items: WorkItem[]; ctx: RenderCtx }): JSX.Element {
  return (
    <div className="my-1">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return renderWorkItem(item, i, ctx, { streaming: ctx.running && isLast })
      })}
    </div>
  )
}

/**
 * A completed run: fold consecutive quiet steps (reads/greps/bash/status) into
 * a "Worked · N steps" chip, keep reasoning as a collapsible Thought, and
 * render file edits inline as diff cards.
 */
function CompletedRun({ items, ctx }: { items: WorkItem[]; ctx: RenderCtx }): JSX.Element {
  const nodes: JSX.Element[] = []
  let quiet: WorkItem[] = []
  let quietStart = 0

  const flushQuiet = (): void => {
    if (quiet.length === 0) return
    if (quiet.length === 1) {
      nodes.push(renderWorkItem(quiet[0]!, quietStart, ctx, { streaming: false }))
    } else {
      nodes.push(<WorkGroup key={`wg-${quietStart}`} items={quiet} ctx={ctx} />)
    }
    quiet = []
  }

  items.forEach((item, i) => {
    if (isEdit(item) || (item.type === 'entry' && item.entry.kind === 'reasoning')) {
      flushQuiet()
      nodes.push(renderWorkItem(item, i, ctx, { streaming: false }))
    } else {
      if (quiet.length === 0) quietStart = i
      quiet.push(item)
    }
  })
  flushQuiet()

  return <div className="my-1">{nodes}</div>
}

function renderWorkItem(
  item: WorkItem,
  index: number,
  ctx: RenderCtx,
  opts: { streaming: boolean },
): JSX.Element {
  if (item.type === 'tool') {
    const running = ctx.running && (item.view.pending || (ctx.activeId != null && item.view.key === ctx.activeId))
    if (item.view.fileModify) {
      return <FileEditCard key={item.view.key} view={item.view} running={running} workDir={ctx.workDir} />
    }
    return <ToolCallRow key={item.view.key} view={item.view} running={running} workDir={ctx.workDir} />
  }
  const entry = item.entry
  const key = entry.id ?? `w-${index}`
  if (entry.kind === 'reasoning') {
    const active = ctx.activeId != null && entry.id === ctx.activeId
    return <ThoughtBlock key={key} text={entry.text} streaming={opts.streaming && active} />
  }
  if (!entry.text.trim()) return <span key={key} />
  const isAgent = entry.kind === 'sub_agent_rollup' || entry.kind === 'sub_agent_done'
  return <WorkStatusLine key={key} text={entry.text} agent={isAgent} dim={entry.dim} />
}

/** Collapsed run of quiet steps: "Worked · N steps"; expands to the rows. */
function WorkGroup({ items, ctx }: { items: WorkItem[]; ctx: RenderCtx }): JSX.Element {
  const [open, setOpen] = useState(false)
  const toolCount = items.filter((i) => i.type === 'tool').length
  let elapsed = 0
  for (const i of items) {
    if (i.type === 'tool' && typeof i.view === 'object') {
      // elapsed is carried on the projected entry, not the view; approximate
      // from any entry items below.
    }
    if (i.type === 'entry' && typeof i.entry.elapsedMs === 'number') elapsed += i.entry.elapsedMs
  }
  const stepLabel = toolCount > 0 ? `${toolCount} ${toolCount === 1 ? 'step' : 'steps'}` : `${items.length} steps`
  const time = elapsed >= 1000 ? ` · ${(elapsed / 1000).toFixed(0)}s` : ''

  return (
    <div className="my-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-7 items-center gap-2 rounded-md py-1 pl-0.5 pr-2 text-left transition hover:bg-line-soft/40"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-line-soft/70 text-ink-3 transition group-hover:text-ink">
          <Settings2 className="h-3 w-3" strokeWidth={1.8} />
        </span>
        <span className="text-[14px] font-medium text-ink-2">Worked{time}</span>
        <span className="text-[13.5px] text-ink-4">· {stepLabel}</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col border-l border-line-soft/70 pl-3">
          {items.map((item, i) => renderWorkItem(item, i, ctx, { streaming: false }))}
        </div>
      )}
    </div>
  )
}

// ── Prose ──

function UserBubble({ text, queued }: { text: string; queued?: boolean }): JSX.Element {
  return (
    <div className="group/message my-3.5 flex items-start justify-end gap-2">
      <MessageCopyButton text={text} label="Copy message" align="left" />
      <div
        className={cn(
          'max-w-[72%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15.5px] leading-[1.55]',
          queued && 'opacity-60',
        )}
        style={{ background: 'var(--color-bubble)', color: 'var(--color-bubble-ink)' }}
      >
        {text}
      </div>
    </div>
  )
}

function AssistantText({
  text,
  active,
  markdownMode,
}: {
  text: string
  active: boolean
  markdownMode: 'rendered' | 'raw'
}): JSX.Element {
  if (!text.trim()) return <span />
  return (
    <div className="group/message relative my-2">
      <MessageCopyButton text={text} label="Copy response" align="right" />
      {markdownMode === 'raw' ? (
        <div
          className={cn(
            'mono whitespace-pre-wrap pr-9 text-[14.5px] leading-[1.65] text-ink-2',
            active && 'shimmer-text',
          )}
        >
          {text}
        </div>
      ) : (
        <Markdown text={text} className={cn(active && 'shimmer-text')} />
      )}
    </div>
  )
}

function AgentResultRow({ entry, ctx }: { entry: ConversationEntry; ctx: RenderCtx }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const full = entry.fullText && entry.fullText !== entry.text ? entry.fullText : null
  const childId = typeof entry.meta?.agentId === 'string' ? entry.meta.agentId : null
  const expandable = Boolean(full || childId)

  return (
    <div className="my-2 rounded-xl border border-line-soft bg-pane-2/40">
      <button
        type="button"
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-[14px]',
          expandable && 'transition hover:bg-line-soft/40',
        )}
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} />
        <span className={cn('min-w-0 flex-1 text-ink-2', !expanded && 'truncate')}>
          {entry.text || 'Agent complete'}
        </span>
        {expandable && (
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', expanded && 'rotate-90')}
            strokeWidth={2}
          />
        )}
      </button>
      {expanded && (
        <div className="border-t border-line-soft/60 px-3 py-2 text-[14px] leading-[1.6] text-ink-2">
          {full && <div className="whitespace-pre-wrap break-words">{full}</div>}
          {childId && (
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3 transition hover:text-ink"
            >
              <ChevronRight
                className={cn('h-3 w-3 transition-transform', showTranscript && 'rotate-90')}
                strokeWidth={2}
              />
              Transcript
            </button>
          )}
          {showTranscript && childId && <ChildTranscript tabId={ctx.tabId} childId={childId} ctx={ctx} />}
        </div>
      )}
    </div>
  )
}

/** Nested read-only view of a child agent's projected log. Pass the child's
 * logRevision to keep a LIVE child's transcript refreshing as it works. */
export function ChildTranscriptView({
  tabId,
  childId,
  workDir,
  revision,
}: {
  tabId: string
  childId: string
  workDir?: string
  revision?: number
}): JSX.Element {
  const ctx: RenderCtx = { activeId: null, running: false, workDir, markdownMode: 'rendered', tabId }
  return <ChildTranscript tabId={tabId} childId={childId} ctx={ctx} revision={revision} />
}

function ChildTranscript({
  tabId,
  childId,
  ctx,
  revision,
}: {
  tabId: string
  childId: string
  ctx: RenderCtx
  revision?: number
}): JSX.Element {
  const request = useSessionStore((s) => s.request)
  const [entries, setEntries] = useState<ConversationEntry[] | null | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    request<ConversationEntry[] | null>(tabId, 'session.getProjectedChildLog', { childId })
      .then((r) => {
        if (!cancelled) setEntries(r)
      })
      .catch(() => {
        if (!cancelled) setEntries(null)
      })
    return () => {
      cancelled = true
    }
  }, [tabId, childId, request, revision])

  if (entries === 'loading') return <div className="mt-2 text-[13px] text-ink-4">Loading transcript…</div>
  if (!entries || entries.length === 0) return <div className="mt-2 text-[13px] text-ink-4">No transcript available.</div>
  const blocks = buildBlocks(entries)
  return (
    <div className="mt-2 border-l border-line-soft/60 pl-3">
      {blocks.map((block, i) => renderBlock(block, i, { ...ctx, running: false, activeId: null }, false))}
    </div>
  )
}

function ThoughtBlock({ text, streaming }: { text: string; streaming: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  if (!text.trim() && !streaming) return <span />

  if (streaming) {
    return (
      <div className="my-2">
        <div className="flex min-h-7 items-center gap-1.5 text-[14.5px]">
          <span className="shimmer-text font-medium text-ink-2">Thinking…</span>
        </div>
        {text.trim() && (
          <div className="mt-1 ml-1 whitespace-pre-wrap border-l-2 border-accent/40 pl-3 text-[14px] leading-[1.6] text-ink-4 shimmer-text">
            {thinkingTail(text)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="my-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-7 items-center gap-1.5 rounded-md text-[14.5px] transition hover:bg-line-soft/40"
      >
        <ChevronRight
          className={cn('h-3 w-3 text-ink-4 transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        <span className="font-medium text-ink-3 group-hover:text-ink-2">Thought</span>
      </button>
      {open && (
        <div className="mt-1 ml-1 whitespace-pre-wrap border-l-2 border-line-soft pl-3 text-[14px] leading-[1.6] text-ink-4">
          {renderBoldRuns(text)}
        </div>
      )}
    </div>
  )
}

// ── Tool rows ──

function ToolCallRow({
  view,
  running,
  workDir,
}: {
  view: ToolCallView
  running: boolean
  workDir?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = toolIcon(view.toolName)
  const canExpand = view.resultText.trim().length > 0
  const summary = shortenSummary(view.summary || view.toolName, workDir)

  return (
    <div className="my-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => canExpand && setOpen((v) => !v)}
        disabled={!canExpand}
        className={cn(
          'flex w-full items-center gap-2 rounded-md py-1 pl-0.5 pr-2 text-left transition',
          canExpand && 'hover:bg-line-soft/40',
        )}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-ink-4">
          {running ? <span className="working-spinner" /> : <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />}
        </span>
        <span className="shrink-0 text-[13px] font-medium text-ink-3">{toolLabel(view.toolName)}</span>
        <span className={cn('mono min-w-0 flex-1 truncate text-[13px]', running ? 'shimmer-text' : 'text-ink-2')}>
          {summary}
        </span>
        {view.isError && <span className="shrink-0 text-[12px] text-error">failed</span>}
        {canExpand && (
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', open && 'rotate-90')}
            strokeWidth={2}
          />
        )}
      </button>
      {open && canExpand && (
        <div
          className={cn(
            'group/output relative my-1 ml-6 overflow-hidden rounded-lg border bg-code-bg',
            view.isError ? 'border-error/30' : 'border-line-soft',
          )}
        >
          <pre
            className={cn(
              'mono max-h-[400px] overflow-auto whitespace-pre px-3.5 py-3 text-[13px] leading-[1.55]',
              view.isError ? 'text-error' : 'text-ink-2',
            )}
          >
            {truncateResult(view.resultText)}
          </pre>
          <CopyButton getText={() => truncateResult(view.resultText)} />
        </div>
      )}
    </div>
  )
}

function FileEditCard({
  view,
  running,
  workDir,
}: {
  view: ToolCallView
  running: boolean
  workDir?: string
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const fm = view.fileModify!
  const isNew = fm.mode === 'write' && fm.hunks.length === 0
  const basename = (view.filePath ?? fm.filePath).split(/[\\/]/).pop() ?? fm.filePath
  const rel = shortenSummary(view.filePath ?? fm.filePath, workDir)
  const HeaderIcon = isNew ? FilePlus : FilePenLine
  const label = isNew ? 'Created' : fm.mode === 'write' ? 'Overwrote' : 'Edited'
  const FileIcon = iconForExtension(basename)

  return (
    <div
      className={cn(
        'my-2 overflow-hidden rounded-xl border bg-code-bg',
        view.isError ? 'border-error/40' : running ? 'border-accent/40' : 'border-line-soft',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-line-soft/40"
      >
        <span
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md',
            isNew ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent',
          )}
        >
          {running ? <span className="working-spinner" /> : <HeaderIcon className="h-3.5 w-3.5" strokeWidth={1.7} />}
        </span>
        <span className="shrink-0 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">{label}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px]">
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.6} />
          <span className="mono truncate font-medium text-ink">{basename}</span>
          {rel && rel !== basename && <span className="mono ml-1 truncate text-[12px] text-ink-4">{rel}</span>}
        </span>
        <ChevronRight
          className={cn('h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform', open && 'rotate-90')}
          strokeWidth={1.8}
        />
      </button>
      {open && (
        <div className="border-t border-line-soft/60">
          <StructuredDiff data={fm} workDir={workDir} />
        </div>
      )}
    </div>
  )
}

// ── Misc rows ──

function WorkStatusLine({ text, agent, dim }: { text: string; agent?: boolean; dim?: boolean }): JSX.Element {
  return (
    <div className={cn('mono flex items-baseline gap-1.5 py-0.5 text-[13px]', dim ? 'text-ink-4' : 'text-ink-3')}>
      {agent && <Bot className="h-3 w-3 shrink-0 translate-y-0.5 text-ink-4" strokeWidth={1.7} />}
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  )
}

function StatusLine({ text, dim }: { text: string; dim?: boolean }): JSX.Element {
  return <div className={cn('my-1 text-center text-[13px] italic', dim ? 'text-ink-4' : 'text-ink-3')}>{text}</div>
}

function TurnEndLine({ entry }: { entry: ConversationEntry }): JSX.Element | null {
  const status = entry.meta?.turnEndStatus as string | undefined
  const ms = entry.elapsedMs
  const elapsed = typeof ms === 'number' && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : ''
  if (status === 'interrupted') return <div className="my-1 text-center text-[12px] text-ink-4">interrupted{elapsed ? ` · ${elapsed}` : ''}</div>
  if (status === 'error') return <div className="my-1 text-center text-[12px] text-error">failed{elapsed ? ` · ${elapsed}` : ''}</div>
  if (!elapsed) return null
  return <div className="my-1 text-center text-[12px] text-ink-4">✓ {elapsed}</div>
}

function ErrorRow({ text }: { text: string }): JSX.Element {
  return (
    <div className="my-1.5 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" strokeWidth={1.8} />
      <div className="flex-1 whitespace-pre-wrap text-[14px] text-error">{text}</div>
    </div>
  )
}

function Divider({ label }: { label: string }): JSX.Element {
  return (
    <div className="my-4 flex items-center gap-3 text-[12px] text-ink-4">
      <div className="h-px flex-1 bg-line-soft" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-line-soft" />
    </div>
  )
}

function WorkingLine(): JSX.Element {
  return (
    <div className="my-2 flex items-center gap-2 text-[13.5px] text-ink-3">
      <span className="working-spinner" />
      <span className="shimmer-text">Working…</span>
    </div>
  )
}

// ── Shared bits ──

function MessageCopyButton({
  text,
  label,
  align,
}: {
  text: string
  label: string
  align: 'left' | 'right'
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const disabled = !text.trim()
  const copy = async (): Promise<void> => {
    if (disabled) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1100)
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={disabled}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'grid h-7 w-7 shrink-0 place-items-center rounded text-ink-4 opacity-0 transition',
        'hover:bg-line-soft hover:text-ink focus-visible:opacity-100 group-hover/message:opacity-100',
        align === 'right' && 'absolute right-0 top-0',
        disabled && 'pointer-events-none',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function CopyButton({ getText }: { getText: () => string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(getText())
        } catch {
          // ignore
        }
      }}
      title="Copy output"
      aria-label="Copy output"
      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md border border-line-soft bg-pane-2 text-ink-3 opacity-0 transition hover:border-line hover:text-ink group-hover/output:opacity-100"
    >
      <Copy className="h-3 w-3" strokeWidth={1.7} />
    </button>
  )
}

function renderBoldRuns(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <strong key={key++} className="font-semibold text-ink-3">
        {match[1]}
      </strong>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const TOOL_LABELS: Record<string, string> = {
  bash: 'Run',
  bash_background: 'Run',
  shell: 'Run',
  read_file: 'Read',
  read: 'Read',
  write_file: 'Write',
  write: 'Write',
  edit_file: 'Edit',
  edit: 'Edit',
  grep: 'Search',
  glob: 'Glob',
  list_dir: 'List',
  web_search: 'Web',
  web_fetch: 'Fetch',
  spawn: 'Agent',
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

function toolIcon(name: string): LucideIcon {
  switch (name) {
    case 'bash':
    case 'bash_background':
    case 'shell':
      return Terminal
    case 'read_file':
    case 'read':
      return FileText
    case 'write_file':
    case 'write':
      return FilePlus
    case 'edit_file':
    case 'edit':
      return FilePenLine
    case 'grep':
      return Search
    case 'glob':
    case 'list_dir':
      return FolderSearch
    case 'web_search':
    case 'web_fetch':
      return Globe
    case 'spawn':
      return Bot
    default:
      if (name.startsWith('mcp__')) return Wrench
      if (name.includes('todo') || name.includes('plan')) return ListChecks
      return Wrench
  }
}

function truncateResult(text: string): string {
  let cleaned = text.replace(/^\[Lines? \d+-\d+ of \d+[^\]]*\]\n?/gm, '')
  cleaned = cleaned.replace(/^OK: Wrote \d+ .+\n?/m, '')
  const lines = cleaned.split('\n')
  if (lines.length <= 60) return cleaned
  const head = lines.slice(0, 40).join('\n')
  const tail = lines.slice(-15).join('\n')
  return `${head}\n\n  … ${lines.length - 55} lines hidden …\n\n${tail}`
}
