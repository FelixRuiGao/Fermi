/**
 * Right column — desktop tool panels.
 *
 * Stage-1 rebuild: consumes the new store (plan / live agents / background
 * shells / context usage from the projected status) plus the Electron git
 * panel. Stage 3 splits this into full DiffPanel / FilesPanel / SearchPanel
 * and reconciles the shared items (plan bar, activity bar) with their inline
 * placements. The legacy 3101-line version is archived for that work.
 */

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  CircleDot,
  GitBranch,
  Loader2,
  SquareTerminal,
  ListChecks,
  Bot,
  Gauge,
  FileDiff,
} from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { api } from '@/lib/api.js'
import { useSessionStore } from '@/state/sessionStore.js'
import { childStatusView, isLiveChild } from '@/lib/transcriptModel.js'
import type { GitStatus, SessionTab } from '@shared/rpc.js'

export function RightPane({ tab }: { tab: SessionTab }): JSX.Element | null {
  const state = useSessionStore((s) => s.perTab[tab.tabId])
  const [git, setGit] = useState<GitStatus | null>(null)

  useEffect(() => {
    if (tab.status !== 'ready') return
    let cancelled = false
    api.git
      .status(tab.workDir)
      .then((g) => {
        if (!cancelled) setGit(g)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [tab.workDir, tab.status, state?.logRevision])

  if (!state || state.needsInit || tab.status !== 'ready') return null

  const status = state.status
  const plan = state.plan
  const liveChildren = state.children.filter(isLiveChild)
  const shells = state.shells
  const changedFiles = git?.files ?? []

  const usedPct =
    status && status.contextBudget > 0
      ? Math.min(100, Math.max(0, (status.lastInputTokens / status.contextBudget) * 100))
      : 0

  return (
    <aside className="hairline-l flex w-[320px] shrink-0 flex-col overflow-y-auto bg-rail">
      {git?.isRepo && (
        <div className="flex items-center gap-2 px-4 py-3 text-[12.5px] text-ink-3">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.7} />
          <span className="truncate font-medium text-ink-2">{git.branch ?? 'detached'}</span>
          {git.ahead > 0 && <span className="mono text-ink-4">↑{git.ahead}</span>}
          {git.behind > 0 && <span className="mono text-ink-4">↓{git.behind}</span>}
        </div>
      )}

      <Section title="Context" icon={<Gauge className="h-3.5 w-3.5" strokeWidth={1.7} />} defaultOpen>
        {status ? (
          <div className="px-1">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-ink-3">Used</span>
              <span className="mono text-ink-2">
                {fmt(status.lastInputTokens)} / {fmt(status.contextBudget)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-soft">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  usedPct >= 85 ? 'bg-error' : usedPct >= 65 ? 'bg-warning' : 'bg-accent',
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-ink-4">
              <span>{status.lifetimeToolCallCount} tool calls</span>
              <span className="mono">{usedPct.toFixed(0)}%</span>
            </div>
          </div>
        ) : (
          <Empty>No session data yet</Empty>
        )}
      </Section>

      <Section
        title="Changes"
        icon={<FileDiff className="h-3.5 w-3.5" strokeWidth={1.7} />}
        count={changedFiles.length}
        defaultOpen
      >
        {changedFiles.length === 0 ? (
          <Empty>{git?.isRepo ? 'Working tree clean' : 'Not a git repository'}</Empty>
        ) : (
          <div className="flex flex-col">
            {changedFiles.slice(0, 100).map((f) => {
              const add = (f.stagedAdditions ?? 0) + (f.unstagedAdditions ?? 0)
              const del = (f.stagedDeletions ?? 0) + (f.unstagedDeletions ?? 0)
              const name = f.path.split('/').pop() ?? f.path
              const dir = f.path.slice(0, f.path.length - name.length)
              return (
                <div
                  key={f.path}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition hover:bg-line-soft/50"
                  title={f.path}
                >
                  <span className="mono w-3 shrink-0 text-center text-[11px] text-ink-4">
                    {(f.staged !== ' ' ? f.staged : f.unstaged) || 'M'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-ink-2">{name}</span>
                    {dir && <span className="ml-1 text-[11.5px] text-ink-4">{dir}</span>}
                  </span>
                  <span className="mono flex shrink-0 gap-1.5 text-[11.5px]">
                    {add > 0 && <span className="text-diff-add-ink">+{add}</span>}
                    {del > 0 && <span className="text-diff-rm-ink">−{del}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {plan.length > 0 && (
        <Section title="Plan" icon={<ListChecks className="h-3.5 w-3.5" strokeWidth={1.7} />} count={plan.length} defaultOpen>
          <div className="flex flex-col gap-0.5">
            {plan.map((c, i) => (
              <div key={i} className="flex items-start gap-2 px-1 py-0.5 text-[13px]">
                <span className="mt-0.5 shrink-0">
                  {c.status === 'done' ? (
                    <span className="text-success">✓</span>
                  ) : c.status === 'active' ? (
                    <CircleDot className="h-3 w-3 text-accent" strokeWidth={2} />
                  ) : (
                    <span className="text-ink-4">○</span>
                  )}
                </span>
                <span
                  className={cn(
                    'leading-[1.4]',
                    c.status === 'done' ? 'text-ink-4 line-through' : c.status === 'active' ? 'text-ink' : 'text-ink-2',
                  )}
                >
                  {c.text}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {liveChildren.length > 0 && (
        <Section title="Agents" icon={<Bot className="h-3.5 w-3.5" strokeWidth={1.7} />} count={liveChildren.length} defaultOpen>
          <div className="flex flex-col gap-1">
            {liveChildren.map((c) => {
              const v = childStatusView(c)
              return (
                <div key={v.id} className="rounded-md px-2 py-1.5 text-[13px] transition hover:bg-line-soft/50">
                  <div className="flex items-center gap-2">
                    {v.needsApproval ? (
                      <CircleDot className="h-3 w-3 shrink-0 text-warning" strokeWidth={2} />
                    ) : (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-ink-2">{v.label}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-4">{v.phase}</span>
                  </div>
                  {v.detail && <div className="mono ml-5 truncate text-[11.5px] text-ink-4">{v.detail}</div>}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {shells.length > 0 && (
        <Section
          title="Background shells"
          icon={<SquareTerminal className="h-3.5 w-3.5" strokeWidth={1.7} />}
          count={shells.length}
          defaultOpen
        >
          <div className="flex flex-col gap-1">
            {shells.map((sh) => (
              <div key={sh.id} className="rounded-md px-2 py-1.5 text-[13px] transition hover:bg-line-soft/50">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      sh.status === 'running' ? 'bg-accent' : sh.status === 'exited' ? 'bg-success' : 'bg-error',
                    )}
                  />
                  <span className="mono min-w-0 flex-1 truncate text-ink-2">{sh.command}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-4">{Math.round(sh.elapsedSeconds)}s</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </aside>
  )
}

function Section({
  title,
  icon,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="hairline-b">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-line-soft/30"
      >
        <span className="text-ink-4">{icon}</span>
        <span className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="mono rounded-full bg-line-soft px-1.5 text-[11px] text-ink-3">{count}</span>
        )}
        <ChevronDown
          className={cn('ml-auto h-3.5 w-3.5 text-ink-4 transition-transform', !open && '-rotate-90')}
          strokeWidth={1.8}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="px-1 py-1 text-[12.5px] text-ink-4">{children}</div>
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
