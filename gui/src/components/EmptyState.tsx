/**
 * Empty state: local workspace/session overview.
 */
import { useState } from 'react'
import { Clock3, FolderOpen, Layers, MessageSquare } from 'lucide-react'
import { useSessionStore } from '@/state/sessionStore.js'
import { api } from '@/lib/api.js'
import { cn } from '@/lib/cn.js'
import { projectName, shortPath } from '@/lib/path.js'
import type { SessionHistoryItem } from '@shared/rpc.js'

export function EmptyState(): JSX.Element {
  const createDraftTab = useSessionStore((s) => s.createDraftTab)
  const openHistorySession = useSessionStore((s) => s.openHistorySession)
  const history = useSessionStore((s) => s.history)
  const [creating, setCreating] = useState(false)
  const totalSessions = history.reduce((sum, group) => sum + group.sessions.length, 0)
  const recent = history
    .flatMap((group) => group.sessions.map((session) => ({ session, workDir: group.workDir })))
    .sort((a, b) => Date.parse(b.session.lastActiveAt) - Date.parse(a.session.lastActiveAt))
    .slice(0, 5)
  const topWorkspace = [...history]
    .sort((a, b) => b.sessions.length - a.sessions.length)[0] ?? null

  const start = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const dir = await api.workspace.pickDirectory()
      if (dir) createDraftTab(dir)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-pane px-8 py-8">
      <div className="w-full max-w-[760px]">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[12px] border border-line-soft bg-pane-2 text-ink-3">
            <FolderOpen className="h-4 w-4" strokeWidth={1.7} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[20px] font-semibold text-ink">
              {totalSessions > 0 ? 'Local workspaces' : 'Open a workspace'}
            </div>
            <div className="mt-0.5 truncate text-[14px] text-ink-3">
              {totalSessions > 0 ? 'Recent sessions and workspace activity' : 'Start with a project folder.'}
            </div>
          </div>
          <button
            type="button"
            onClick={start}
            disabled={creating}
            className={cn(
              'rounded-[10px] border border-line bg-pane-2 px-3 py-2 text-[14px] font-medium text-ink transition',
              'hover:border-line hover:bg-line-soft',
              creating && 'opacity-50',
            )}
          >
            {creating ? 'Opening…' : 'Open workspace'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <OverviewCell icon={<Layers className="h-3.5 w-3.5" />} label="Workspaces" value={history.length} />
          <OverviewCell icon={<MessageSquare className="h-3.5 w-3.5" />} label="Sessions" value={totalSessions} />
          <OverviewCell
            icon={<Clock3 className="h-3.5 w-3.5" />}
            label="Most active"
            value={topWorkspace ? projectName(topWorkspace.workDir) : 'None'}
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-4">
              Recent
            </div>
            <div className="h-px flex-1 bg-line-soft" />
          </div>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-line-soft px-3 py-3 text-[14px] text-ink-3">
              No saved sessions yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {recent.map(({ session, workDir }) => (
                <RecentSessionButton
                  key={`${workDir}:${session.sessionId}`}
                  session={session}
                  workDir={workDir}
                  onClick={() => void openHistorySession(workDir, session.sessionId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OverviewCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}): JSX.Element {
  return (
    <div className="rounded-lg border border-line-soft bg-pane-2 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-ink-4">
        {icon}
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="truncate text-[18px] font-semibold text-ink">{value}</div>
    </div>
  )
}

function RecentSessionButton({
  session,
  workDir,
  onClick,
}: {
  session: SessionHistoryItem
  workDir: string
  onClick: () => void
}): JSX.Element {
  const title = session.title || session.summary || 'Untitled session'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-line-soft bg-pane-2 px-3 py-2.5 text-left transition hover:border-line hover:bg-line-soft"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
          {shortPath(workDir)}
        </div>
      </div>
      <div className="mono shrink-0 text-[12px] text-ink-4">
        {formatRelative(session.lastActiveAt)}
      </div>
    </button>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const minutes = Math.max(0, Math.floor(diff / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}
