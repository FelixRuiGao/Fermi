/**
 * Persistent live-activity strip pinned above the composer: one row per running
 * sub-agent and background shell, updating from the server's child.changed /
 * shells.changed pushes. Agent rows expand into the child's inline transcript;
 * shell rows expand into a live output tail with a stop button. Disappears on
 * its own when nothing is running.
 */

import { useEffect, useState } from 'react'
import { Bot, ChevronRight, Square, SquareTerminal } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { useSessionStore } from '@/state/sessionStore.js'
import { childStatusView, isLiveChild, liveActivitySummary } from '@/lib/transcriptModel.js'
import { ChildTranscriptView } from '@/components/Transcript.js'
import type { ChildSessionSnapshot, ShellSnapshot, SessionTab } from '@shared/rpc.js'

export function LiveActivity({ tab }: { tab: SessionTab }): JSX.Element | null {
  const children = useSessionStore((s) => s.perTab[tab.tabId]?.children ?? [])
  const shells = useSessionStore((s) => s.perTab[tab.tabId]?.shells ?? [])
  const [collapsed, setCollapsed] = useState(false)

  const liveAgents = children.filter(isLiveChild)
  const liveShells = shells.filter((sh) => sh.status === 'running')
  if (tab.status === 'draft' || (liveAgents.length === 0 && liveShells.length === 0)) return null

  return (
    <div className="session-bottom-gutter hairline-t bg-pane pl-6">
      <div className="mx-auto max-w-[840px] py-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-line-soft/30"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-[13px] font-medium text-ink-2">
            {liveActivitySummary(liveAgents.length, liveShells.length)}
          </span>
          {collapsed && liveAgents.length > 0 && (
            <span className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">
              {childStatusView(liveAgents[liveAgents.length - 1]!).detail}
            </span>
          )}
          <ChevronRight
            className={cn('ml-auto h-3 w-3 shrink-0 text-ink-4 transition-transform', !collapsed && 'rotate-90')}
            strokeWidth={2}
          />
        </button>
        {!collapsed && (
          <div className="mt-1 flex flex-col gap-0.5">
            {liveAgents.map((c) => (
              <AgentRow key={c.id} tabId={tab.tabId} workDir={tab.workDir} child={c} />
            ))}
            {liveShells.map((sh) => (
              <ShellRow key={sh.id} tabId={tab.tabId} shell={sh} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentRow({ tabId, workDir, child }: { tabId: string; workDir: string; child: ChildSessionSnapshot }): JSX.Element {
  const [open, setOpen] = useState(false)
  const v = childStatusView(child)
  return (
    <div className="rounded-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-line-soft/40"
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.7} />
        <span className="shrink-0 text-[13px] text-ink-2">{v.label}</span>
        <span className={cn('shrink-0 text-[12px]', v.needsApproval ? 'text-warning' : 'shimmer-text text-ink-3')}>
          {v.phase}
        </span>
        {v.toolCount > 0 && <span className="shrink-0 text-[11.5px] text-ink-4">{v.toolCount} tools</span>}
        <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-ink-4" title={v.detail}>
          {v.detail}
        </span>
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="ml-6 max-h-[280px] overflow-y-auto border-l border-line-soft/60 pl-2">
          <ChildTranscriptView tabId={tabId} childId={child.id} workDir={workDir} revision={child.logRevision} />
        </div>
      )}
    </div>
  )
}

function ShellRow({ tabId, shell }: { tabId: string; shell: ShellSnapshot }): JSX.Element {
  const request = useSessionStore((s) => s.request)
  const [open, setOpen] = useState(false)
  const [tail, setTail] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const fetchTail = (): void => {
      request<{ logTail: string; logTruncated: boolean }>(tabId, 'session.getBackgroundShellDetail', {
        id: shell.id,
        maxChars: 4000,
      })
        .then((d) => {
          if (!cancelled) setTail((d.logTruncated ? '…\n' : '') + (d.logTail || '(no output yet)'))
        })
        .catch(() => {
          if (!cancelled) setTail('(output unavailable)')
        })
    }
    fetchTail()
    const timer = setInterval(fetchTail, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open, shell.id, tabId, request])

  const stop = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void request(tabId, 'session.stopBackgroundShell', { id: shell.id }).catch(() => undefined)
  }

  return (
    <div className="rounded-md">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-line-soft/40"
      >
        <SquareTerminal className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.7} />
        <span className="mono min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={shell.command}>
          {shell.command}
        </span>
        <span className="shrink-0 text-[11.5px] text-ink-4">{Math.round(shell.elapsedSeconds)}s</span>
        <button
          type="button"
          onClick={stop}
          title="Stop shell"
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-4 transition hover:bg-error/15 hover:text-error"
        >
          <Square className="h-2.5 w-2.5 fill-current" />
        </button>
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
      </div>
      {open && (
        <pre className="mono ml-6 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-line-soft bg-code-bg px-2.5 py-2 text-[12px] leading-[1.5] text-ink-3">
          {tail ?? 'Loading…'}
        </pre>
      )}
    </div>
  )
}
