import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Code2, MoreHorizontal, FolderOpen, Pencil, X, Copy, GitBranch, ScrollText, Archive, Pin } from 'lucide-react'
import { useSessionStore } from '@/state/sessionStore.js'
import { Composer } from '@/components/Composer.js'
import { Transcript } from '@/components/Transcript.js'
import { StatusBar } from '@/components/StatusBar.js'
import { AskBar } from '@/components/ApprovalCard.js'
import { InitWizard } from '@/components/InitWizard.js'
import { cn } from '@/lib/cn.js'
import { projectName } from '@/lib/path.js'
import { api } from '@/lib/api.js'
import type { ConversationEntry, SessionTab } from '@shared/rpc.js'

export function SessionPane({ tab }: { tab: SessionTab }): JSX.Element {
  const state = useSessionStore((s) => s.perTab[tab.tabId])
  const markdownMode = useSessionStore((s) => s.markdownMode)
  const toggleMarkdownMode = useSessionStore((s) => s.toggleMarkdownMode)
  const submitTurn = useSessionStore((s) => s.submitTurn)
  const closeTab = useSessionStore((s) => s.closeTab)
  const refreshMeta = useSessionStore((s) => s.refreshMeta)
  const refreshHistory = useSessionStore((s) => s.refreshHistory)
  const openHistorySession = useSessionStore((s) => s.openHistorySession)
  const setHistorySessionPinned = useSessionStore((s) => s.setHistorySessionPinned)
  const history = useSessionStore((s) => s.history)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  const conversation = state?.conversation ?? []
  const running = state?.status?.currentTurnRunning ?? false

  const onScroll = (): void => {
    const el = transcriptRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }

  useEffect(() => {
    const el = transcriptRef.current
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight
  }, [state?.logRevision, running])

  const onSubmit = async (input: string): Promise<void> => {
    await submitTurn(tab.tabId, input)
  }

  const showSessionNotice = (message: string): void => {
    setSessionNotice(message)
    window.setTimeout(() => setSessionNotice((current) => (current === message ? null : current)), 1800)
  }

  const copyLastAgentResponse = async (): Promise<void> => {
    const text = findLastAgentResponse(conversation)
    if (!text) {
      showSessionNotice('No agent response to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      showSessionNotice(`Copied ${text.length} chars`)
    } catch {
      showSessionNotice('Copy failed')
    }
  }

  const copySessionTranscript = async (): Promise<void> => {
    const text = formatTranscriptMarkdown(
      conversation,
      tab.title ?? tab.displayName ?? projectName(tab.workDir),
      tab.workDir,
    )
    if (!text.trim()) {
      showSessionNotice('No transcript to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      showSessionNotice(`Copied transcript (${text.length} chars)`)
    } catch {
      showSessionNotice('Copy failed')
    }
  }

  const forkSession = async (): Promise<void> => {
    if (tab.status === 'draft') return
    try {
      showSessionNotice('Forking session')
      const result = await api.rpc.request<{ sessionId: string; title: string }>(tab.tabId, 'session.fork')
      await refreshHistory()
      const opened = await openHistorySession(tab.workDir, result.sessionId)
      showSessionNotice(opened ? 'Forked session' : 'Fork created but not opened')
    } catch (err) {
      showSessionNotice(err instanceof Error ? err.message : 'Fork failed')
    }
  }

  const archiveSession = async (): Promise<void> => {
    if (tab.status === 'draft' || !tab.sessionId || running) return
    try {
      showSessionNotice('Archiving session')
      await closeTab(tab.tabId)
      await api.history.archiveSession({ workDir: tab.workDir, sessionId: tab.sessionId })
      await refreshHistory()
    } catch (err) {
      showSessionNotice(err instanceof Error ? err.message : 'Archive failed')
    }
  }

  const pinned = tab.sessionId
    ? history
        .find((group) => group.workDir === tab.workDir)
        ?.sessions.some((session) => session.sessionId === tab.sessionId && session.pinned) ?? false
    : false

  const toggleSessionPinned = async (): Promise<void> => {
    if (tab.status === 'draft' || !tab.sessionId) return
    await setHistorySessionPinned(tab.workDir, tab.sessionId, !pinned)
    showSessionNotice(pinned ? 'Unpinned session' : 'Pinned session')
  }

  if (tab.status === 'starting') {
    return (
      <div className="flex h-full items-center justify-center text-ink-3">
        <span className="shimmer-text text-[15px]">Starting session…</span>
      </div>
    )
  }
  if (tab.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-lg rounded-xl border border-error/30 bg-error/5 p-5">
          <div className="text-[15px] font-medium text-error">Session failed to start</div>
          <pre className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.5] text-ink-3">
            {tab.errorMessage ?? 'Unknown error'}
          </pre>
          {(state?.stderrLog?.length ?? 0) > 0 && (
            <pre className="mono mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line-soft bg-pane px-3 py-2 text-[12px] text-ink-4">
              {state!.stderrLog.slice(-20).join('')}
            </pre>
          )}
        </div>
      </div>
    )
  }
  if (state?.needsInit) {
    return <InitWizard tab={tab} />
  }

  const projectLabel = projectName(tab.workDir)
  const sessionTitle = (tab.title ?? tab.displayName ?? '').trim()
  const headerTitle = sessionTitle.length > 0 && sessionTitle !== projectLabel ? sessionTitle : projectLabel
  const headerSubtitle = headerTitle === projectLabel ? '' : projectLabel
  const isEmptyDraft = tab.status === 'draft' && conversation.length === 0
  const showHeaderTitle = !isEmptyDraft

  return (
    <div data-session-pane-root className="flex h-full min-w-0 flex-1 flex-col bg-pane">
      <div className={cn('flex h-12 shrink-0 items-center gap-3 px-6', showHeaderTitle && 'border-b border-line-soft')}>
        <div className="min-w-0 flex-1">
          {showHeaderTitle && (
            <>
              <div className="truncate text-[15px] font-semibold leading-tight text-ink">{headerTitle}</div>
              {headerSubtitle && (
                <div className="mt-0.5 truncate text-[12.5px] leading-tight text-ink-4">{headerSubtitle}</div>
              )}
            </>
          )}
        </div>
        {showHeaderTitle && (
          <HeaderBtn
            label={markdownMode === 'rendered' ? 'Show raw markdown' : 'Render markdown'}
            onClick={toggleMarkdownMode}
            active={markdownMode === 'raw'}
          >
            <Code2 className="h-3.5 w-3.5" strokeWidth={1.7} />
          </HeaderBtn>
        )}
        <HeaderMenu
          tab={tab}
          onClose={() => void closeTab(tab.tabId)}
          onRenamed={() => void refreshMeta(tab.tabId)}
          onCopyLastResponse={() => void copyLastAgentResponse()}
          canCopyLastResponse={!!findLastAgentResponse(conversation)}
          onCopyTranscript={() => void copySessionTranscript()}
          canCopyTranscript={hasVisibleTranscript(conversation)}
          onForkSession={() => void forkSession()}
          canForkSession={tab.status !== 'draft' && !running}
          pinned={pinned}
          onTogglePinned={() => void toggleSessionPinned()}
          canTogglePinned={tab.status !== 'draft' && !!tab.sessionId}
          onArchiveSession={() => void archiveSession()}
          canArchiveSession={tab.status !== 'draft' && !!tab.sessionId && !running}
        />
      </div>
      {sessionNotice && (
        <div className="pointer-events-none fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-full border border-line bg-pane-2 px-3 py-1.5 text-[13px] font-medium text-ink-2 shadow-xl">
          {sessionNotice}
        </div>
      )}

      <div
        ref={transcriptRef}
        onScroll={onScroll}
        className="session-scroll min-h-0 flex-1 overflow-y-auto bg-pane"
      >
        {isEmptyDraft ? (
          <DraftHero project={projectLabel} />
        ) : (
          <Transcript
            entries={conversation}
            activeId={state?.activeLogEntryId ?? null}
            running={running}
            workDir={tab.workDir}
            markdownMode={markdownMode}
            tabId={tab.tabId}
            emptyLabel={tab.status === 'draft' ? null : 'Ready'}
          />
        )}
      </div>
      <AskBar tab={tab} />
      <StatusBar state={state ?? null} />
      <Composer tab={tab} state={state ?? null} onSubmit={onSubmit} disabled={running} />
    </div>
  )
}

function DraftHero({ project }: { project: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-6 pb-24">
      <div className="flex max-w-[480px] flex-col items-center gap-2 text-center">
        <div className="text-[22px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">
          What should we build in <span className="text-accent">{project}</span>?
        </div>
        <div className="text-[13.5px] leading-[1.5] text-ink-4">
          Drop a message below, or <span className="mono text-ink-3">@</span>-reference files to anchor the context.
        </div>
      </div>
    </div>
  )
}

function HeaderBtn({
  children,
  label,
  active,
  ...props
}: {
  children: React.ReactNode
  label?: string
  active?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'grid h-8 w-8 place-items-center rounded transition hover:bg-line-soft hover:text-ink',
        active ? 'bg-line-soft text-ink' : 'text-ink-3',
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function findLastAgentResponse(entries: readonly ConversationEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i]!
    if ((e.kind === 'assistant' || e.kind === 'agent_result') && (e.fullText ?? e.text).trim()) {
      return e.kind === 'agent_result' ? e.fullText ?? e.text : e.text
    }
  }
  return null
}

function hasVisibleTranscript(entries: readonly ConversationEntry[]): boolean {
  return entries.some(
    (e) =>
      (e.kind === 'user' || e.kind === 'assistant' || e.kind === 'agent_result') &&
      (e.fullText ?? e.text).trim().length > 0,
  )
}

function formatTranscriptMarkdown(entries: readonly ConversationEntry[], title: string, workDir: string): string {
  const sections: string[] = []
  for (const e of entries) {
    const text = (e.fullText ?? e.text).trim()
    if (!text) continue
    switch (e.kind) {
      case 'user':
        sections.push(`## User\n\n${text}\n`)
        break
      case 'assistant':
      case 'agent_result':
        sections.push(`## Assistant\n\n${text}\n`)
        break
      case 'reasoning':
        sections.push(`## Reasoning\n\n${text}\n`)
        break
      case 'tool_call':
        sections.push(`### Tool\n\n${text}\n`)
        break
      case 'tool_result':
        sections.push(`#### Tool Result\n\n${text}\n`)
        break
      case 'error':
        sections.push(`## Error\n\n${text}\n`)
        break
      default:
        break
    }
  }
  if (sections.length === 0) return ''
  return [`# ${title.trim() || 'Session transcript'}`, '', `Workspace: \`${workDir}\``, '', ...sections].join('\n')
}

function HeaderMenu({
  tab,
  onClose,
  onRenamed,
  onCopyLastResponse,
  canCopyLastResponse,
  onCopyTranscript,
  canCopyTranscript,
  onForkSession,
  canForkSession,
  pinned,
  onTogglePinned,
  canTogglePinned,
  onArchiveSession,
  canArchiveSession,
}: {
  tab: SessionTab
  onClose: () => void
  onRenamed: () => void
  onCopyLastResponse: () => void
  canCopyLastResponse: boolean
  onCopyTranscript: () => void
  canCopyTranscript: boolean
  onForkSession: () => void
  canForkSession: boolean
  pinned: boolean
  onTogglePinned: () => void
  canTogglePinned: boolean
  onArchiveSession: () => void
  canArchiveSession: boolean
}): JSX.Element {
  const [renameOpen, setRenameOpen] = useState(false)
  const itemCls =
    'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] text-ink-2 outline-none transition hover:bg-line-soft hover:text-ink focus:bg-line-soft focus:text-ink data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[disabled]:hover:bg-transparent data-[disabled]:hover:text-ink-2'

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <HeaderBtn label="Session actions">
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
          </HeaderBtn>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[190px] rounded-2xl border border-line bg-pane-2 p-1.5 shadow-2xl"
          >
            {tab.status !== 'draft' && (
              <>
                <DropdownMenu.Item onSelect={onCopyLastResponse} disabled={!canCopyLastResponse} className={itemCls}>
                  <Copy className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
                  Copy last response
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onCopyTranscript} disabled={!canCopyTranscript} className={itemCls}>
                  <ScrollText className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
                  Copy transcript
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onForkSession} disabled={!canForkSession} className={itemCls}>
                  <GitBranch className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
                  Fork session
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onTogglePinned} disabled={!canTogglePinned} className={itemCls}>
                  <Pin className={cn('h-3.5 w-3.5', pinned ? 'text-accent' : 'text-ink-4')} strokeWidth={1.7} />
                  {pinned ? 'Unpin session' : 'Pin session'}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onArchiveSession} disabled={!canArchiveSession} className={itemCls}>
                  <Archive className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
                  Archive session
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => setRenameOpen(true)} className={itemCls}>
                  <Pencil className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
                  Rename session
                </DropdownMenu.Item>
              </>
            )}
            <DropdownMenu.Item onSelect={() => void api.workspace.openPath(tab.workDir)} className={itemCls}>
              <FolderOpen className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
              Open workspace
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
            <DropdownMenu.Item onSelect={onClose} className={itemCls}>
              <X className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.7} />
              {tab.status === 'draft' ? 'Discard draft' : 'Close session'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <RenameSessionDialog open={renameOpen} onOpenChange={setRenameOpen} tab={tab} onRenamed={onRenamed} />
    </>
  )
}

function RenameSessionDialog({
  open,
  onOpenChange,
  tab,
  onRenamed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: SessionTab
  onRenamed: () => void
}): JSX.Element {
  const [value, setValue] = useState(tab.title ?? tab.displayName ?? projectName(tab.workDir))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setValue(tab.title ?? tab.displayName ?? projectName(tab.workDir))
  }, [open, tab.displayName, tab.title, tab.workDir])

  const submit = async (): Promise<void> => {
    const title = value.trim()
    if (!title || tab.status === 'draft' || saving) return
    setSaving(true)
    try {
      await api.rpc.request(tab.tabId, 'session.setTitle', { title })
      onRenamed()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-pane-2 p-4 shadow-2xl">
          <Dialog.Title className="text-[16px] font-semibold text-ink">Rename session</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] text-ink-4">{projectName(tab.workDir)}</Dialog.Description>
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
            aria-label="Session title"
            className="rename-title-input mt-3 h-9 w-full rounded-lg border border-line-soft bg-pane px-2.5 text-[14px] text-ink outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded px-3 py-1.5 text-[14px] font-medium text-ink-3 transition hover:bg-line-soft hover:text-ink"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!value.trim() || saving}
              className="rounded bg-ink px-3 py-1.5 text-[14px] font-medium text-pane transition hover:opacity-90 disabled:opacity-40"
            >
              Rename
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
