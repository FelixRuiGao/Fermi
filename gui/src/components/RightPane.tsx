/**
 * Right column — desktop tool panels: a persistent Context strip plus tabbed
 * Changes / Files / Search. Plan, live agents and background shells are the
 * "inline shared" surfaces (the top plan bar + the activity strip above the
 * composer), so the right column stays focused on the desktop-native tools a
 * terminal/editor can't offer as well.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  FileDiff,
  Files,
  FolderOpen,
  Gauge,
  Loader2,
  RefreshCw,
  Search as SearchIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { api } from '@/lib/api.js'
import { useSessionStore } from '@/state/sessionStore.js'
import { DiffView } from '@/components/DiffView.js'
import { iconForExtension } from '@/lib/fileIcon.js'
import type { GitFileChange, GitStatus, SessionTab, WorkspaceFileEntry, WorkspaceTextSearchResult } from '@shared/rpc.js'

type PanelTab = 'changes' | 'files' | 'search'

export function RightPane({ tab }: { tab: SessionTab }): JSX.Element | null {
  const state = useSessionStore((s) => s.perTab[tab.tabId])
  const [active, setActive] = useState<PanelTab>('changes')
  const [git, setGit] = useState<GitStatus | null>(null)

  const refreshGit = useCallback(() => {
    if (tab.status !== 'ready') return
    api.git
      .status(tab.workDir)
      .then(setGit)
      .catch(() => undefined)
  }, [tab.workDir, tab.status])

  useEffect(refreshGit, [refreshGit, state?.logRevision])

  if (!state || state.needsInit || tab.status !== 'ready') return null

  const changeCount = git?.files.length ?? 0

  return (
    <aside className="hairline-l flex w-[340px] shrink-0 flex-col overflow-hidden bg-rail">
      <ContextStrip status={state.status} branch={git?.isRepo ? git.branch : null} ahead={git?.ahead ?? 0} behind={git?.behind ?? 0} />

      <div className="hairline-b flex items-center gap-0.5 px-2 pt-1.5">
        <TabButton icon={<FileDiff className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Changes" count={changeCount} active={active === 'changes'} onClick={() => setActive('changes')} />
        <TabButton icon={<Files className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Files" active={active === 'files'} onClick={() => setActive('files')} />
        <TabButton icon={<SearchIcon className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Search" active={active === 'search'} onClick={() => setActive('search')} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active === 'changes' && <ChangesTab tab={tab} git={git} onRefresh={refreshGit} />}
        {active === 'files' && <FilesTab tab={tab} />}
        {active === 'search' && <SearchTab tab={tab} />}
      </div>
    </aside>
  )
}

function TabButton({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count?: number
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-1.5 text-[12.5px] font-medium transition',
        active ? 'bg-pane text-ink' : 'text-ink-3 hover:bg-line-soft/40 hover:text-ink-2',
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="mono rounded-full bg-line-soft px-1.5 text-[10.5px] text-ink-3">{count}</span>
      )}
    </button>
  )
}

function ContextStrip({
  status,
  branch,
  ahead,
  behind,
}: {
  status: import('@shared/rpc.js').SessionStatus | null
  branch: string | null
  ahead: number
  behind: number
}): JSX.Element {
  const usedPct = status && status.contextBudget > 0 ? Math.min(100, Math.max(0, (status.lastInputTokens / status.contextBudget) * 100)) : 0
  return (
    <div className="hairline-b px-4 py-3">
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <Gauge className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.7} />
        <span className="mono">{fmt(status?.lastInputTokens ?? 0)} / {fmt(status?.contextBudget ?? 0)}</span>
        <span className="ml-auto mono">{usedPct.toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-soft">
        <div
          className={cn('h-full rounded-full transition-all', usedPct >= 85 ? 'bg-error' : usedPct >= 65 ? 'bg-warning' : 'bg-accent')}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      {branch && (
        <div className="mono mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
          <span className="truncate text-ink-3">⎇ {branch}</span>
          {ahead > 0 && <span>↑{ahead}</span>}
          {behind > 0 && <span>↓{behind}</span>}
        </div>
      )}
    </div>
  )
}

function ChangesTab({ tab, git, onRefresh }: { tab: SessionTab; git: GitStatus | null; onRefresh: () => void }): JSX.Element {
  const files = git?.files ?? []
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-4">
        <span>{git?.isRepo ? (files.length === 0 ? 'Working tree clean' : `${files.length} changed`) : 'Not a git repo'}</span>
        <button type="button" onClick={onRefresh} className="text-ink-4 transition hover:text-ink" title="Refresh">
          <RefreshCw className="h-3 w-3" strokeWidth={1.8} />
        </button>
      </div>
      {files.map((f) => (
        <ChangedFileRow key={f.path} workDir={tab.workDir} file={f} />
      ))}
    </div>
  )
}

function ChangedFileRow({ workDir, file }: { workDir: string; file: GitFileChange }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const name = file.path.split('/').pop() ?? file.path
  const dir = file.path.slice(0, file.path.length - name.length)
  const add = (file.stagedAdditions ?? 0) + (file.unstagedAdditions ?? 0)
  const del = (file.stagedDeletions ?? 0) + (file.unstagedDeletions ?? 0)
  const Icon = iconForExtension(name)
  const staged = file.staged !== ' ' && file.staged !== '?'

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && diff === null) {
      setLoading(true)
      try {
        setDiff(await api.git.diff({ workDir, path: file.path, staged }))
      } catch {
        setDiff('')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="hairline-b">
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px] transition hover:bg-line-soft/40"
        title={file.path}
      >
        <ChevronRight className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', open && 'rotate-90')} strokeWidth={2} />
        <span className="mono w-3 shrink-0 text-center text-[11px] text-ink-4">
          {(file.staged !== ' ' ? file.staged : file.unstaged) || 'M'}
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.6} />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-ink-2">{name}</span>
          {dir && <span className="ml-1 text-[11px] text-ink-4">{dir}</span>}
        </span>
        <span className="mono flex shrink-0 gap-1.5 text-[11px]">
          {add > 0 && <span className="text-diff-add-ink">+{add}</span>}
          {del > 0 && <span className="text-diff-rm-ink">−{del}</span>}
        </span>
      </button>
      {open && (
        <div className="bg-code-bg">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-ink-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading diff…
            </div>
          ) : diff && diff.trim() ? (
            <DiffView text={diff} workDir={workDir} isError={false} hideHeader flush />
          ) : (
            <div className="px-4 py-3 text-[12px] text-ink-4">No textual diff (binary or no changes).</div>
          )}
        </div>
      )}
    </div>
  )
}

function FilesTab({ tab }: { tab: SessionTab }): JSX.Element {
  const [files, setFiles] = useState<readonly WorkspaceFileEntry[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    api.workspace
      .listFiles(tab.workDir)
      .then((f) => {
        if (!cancelled) setFiles(f)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [tab.workDir])

  const filtered = useMemo(() => {
    if (!files) return []
    const q = query.trim().toLowerCase()
    return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files
  }, [files, query])

  return (
    <div className="flex flex-col">
      <div className="hairline-b p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files"
          className="right-pane-filter-input h-8 w-full rounded-lg border border-line-soft bg-pane px-3 text-[13px] text-ink outline-none"
        />
      </div>
      {files === null ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty>{query ? 'No matching files' : 'No files'}</Empty>
      ) : (
        filtered.slice(0, 500).map((f) => {
          const name = f.path.split('/').pop() ?? f.path
          const dir = f.path.slice(0, f.path.length - name.length)
          const Icon = iconForExtension(name)
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => void api.workspace.openPath(joinPath(tab.workDir, f.path))}
              title={f.path}
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-[13px] transition hover:bg-line-soft/40"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.6} />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-ink-2">{name}</span>
                {dir && <span className="ml-1 text-[11px] text-ink-4">{dir}</span>}
              </span>
            </button>
          )
        })
      )}
    </div>
  )
}

function SearchTab({ tab }: { tab: SessionTab }): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly WorkspaceTextSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<number | null>(null)

  const run = useCallback(
    (q: string) => {
      if (q.trim().length < 2) {
        setResults(null)
        return
      }
      setLoading(true)
      api.workspace
        .searchText({ workDir: tab.workDir, query: q })
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    },
    [tab.workDir],
  )

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => run(query), 250)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [query, run])

  const grouped = useMemo(() => {
    const map = new Map<string, WorkspaceTextSearchResult[]>()
    for (const r of results ?? []) {
      const list = map.get(r.path) ?? []
      list.push(r)
      map.set(r.path, list)
    }
    return [...map.entries()]
  }, [results])

  return (
    <div className="flex flex-col">
      <div className="hairline-b p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspace (ripgrep)"
          className="right-pane-filter-input h-8 w-full rounded-lg border border-line-soft bg-pane px-3 text-[13px] text-ink outline-none"
        />
      </div>
      {loading ? (
        <Loading />
      ) : results === null ? (
        <Empty>Type at least 2 characters</Empty>
      ) : grouped.length === 0 ? (
        <Empty>No matches</Empty>
      ) : (
        grouped.map(([path, rows]) => (
          <div key={path} className="hairline-b">
            <button
              type="button"
              onClick={() => void api.workspace.openPath(joinPath(tab.workDir, path))}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition hover:bg-line-soft/40"
              title={path}
            >
              <FolderOpen className="h-3 w-3 shrink-0 text-ink-4" strokeWidth={1.7} />
              <span className="mono min-w-0 flex-1 truncate text-[12px] text-ink-2">{path}</span>
              <span className="mono shrink-0 text-[11px] text-ink-4">{rows.length}</span>
            </button>
            {rows.slice(0, 20).map((r, i) => (
              <div key={i} className="flex gap-2 px-3 py-0.5 pl-7 text-[12px]">
                <span className="mono shrink-0 text-ink-4">{r.line}</span>
                <span className="mono min-w-0 flex-1 truncate text-ink-3">{r.text.trim()}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

function Loading(): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-ink-4">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="px-4 py-4 text-[12.5px] text-ink-4">{children}</div>
}

function joinPath(workDir: string, rel: string): string {
  return `${workDir.replace(/\/$/, '')}/${rel}`
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
