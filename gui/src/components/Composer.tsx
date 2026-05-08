/**
 * Composer: borderless input + fade overlay + simplified status pills.
 * Matches template: no top border, pane-2 bg textarea, fade-out overlay
 * above, minimal status bar (accept edits / attach / model picker / theme).
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Square, Paperclip, Sun, Moon, Zap, ChevronDown, Check, Brain, Image, Shield, History, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { compactModelLabel } from '@/lib/modelDisplay.js'
import { projectName, shortPath } from '@/lib/path.js'
import { useSessionStore } from '@/state/sessionStore.js'
import { api } from '@/lib/api.js'
import type { ModelDescriptor, PermissionMode, SessionTab } from '@shared/rpc.js'
import type { TabState } from '@/state/sessionStore.js'

const PERMISSION_MODES: PermissionMode[] = ['read_only', 'reversible', 'yolo']
const PERMISSION_LABELS: Record<PermissionMode, string> = {
  read_only: 'Read only',
  reversible: 'Reversible',
  yolo: 'YOLO',
}
const PERMISSION_HINTS: Record<PermissionMode, string> = {
  read_only: 'Writes ask first',
  reversible: 'Edits allowed',
  yolo: 'Most actions allowed',
}
const MAX_PROMPT_HISTORY = 50

export function Composer({
  tab,
  state,
  onSubmit,
  disabled,
}: {
  tab: SessionTab
  state: TabState | null
  onSubmit: (input: string) => Promise<void>
  disabled: boolean
}): JSX.Element {
  const [text, setText] = useState('')
  const [promptHistory, setPromptHistory] = useState<readonly string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const historyDraftRef = useRef('')
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)
  const selectModel = useSessionStore((s) => s.selectModel)
  const refreshStatus = useSessionStore((s) => s.refreshStatus)
  const isDraft = tab.status === 'draft'

  useEffect(() => {
    setPromptHistory(readPromptHistory(tab.workDir))
    setHistoryIndex(null)
    historyDraftRef.current = ''
  }, [tab.workDir])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [text])

  const send = async (): Promise<void> => {
    const v = text.trim()
    if (!v || disabled) return
    const nextHistory = addPromptHistoryEntry(tab.workDir, promptHistory, v)
    setPromptHistory(nextHistory)
    setHistoryIndex(null)
    historyDraftRef.current = ''
    setText('')
    await onSubmit(v)
  }

  const navigateHistory = (direction: -1 | 1): void => {
    if (promptHistory.length === 0) return
    let nextIndex: number | null
    if (historyIndex === null) {
      if (direction === 1) return
      historyDraftRef.current = text
      nextIndex = promptHistory.length - 1
    } else {
      nextIndex = historyIndex + direction
    }

    if (nextIndex < 0) nextIndex = 0
    if (nextIndex >= promptHistory.length) {
      setHistoryIndex(null)
      setText(historyDraftRef.current)
      focusComposerEnd()
      return
    }

    setHistoryIndex(nextIndex)
    setText(promptHistory[nextIndex] ?? '')
    focusComposerEnd()
  }

  const focusComposerEnd = (): void => {
    window.requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      const end = ta.value.length
      ta.focus()
      ta.setSelectionRange(end, end)
    })
  }

  const interrupt = async (): Promise<void> => {
    if (isDraft) return
    try {
      await api.rpc.request(tab.tabId, 'session.requestTurnInterrupt')
      await refreshStatus(tab.tabId)
    } catch {
      // ignore
    }
  }

  const attachFiles = async (): Promise<void> => {
    try {
      const files = await api.workspace.pickFiles(tab.workDir)
      if (files.length === 0) return
      const refs = files.map((file) => formatAttachmentReference(file, tab.workDir)).join(' ')
      const ta = taRef.current
      const start = ta?.selectionStart ?? text.length
      const end = ta?.selectionEnd ?? text.length
      const before = text.slice(0, start)
      const after = text.slice(end)
      const prefix = before.length === 0 || /\s$/.test(before) ? '' : ' '
      const suffix = after.length === 0 || /^\s/.test(after) ? '' : ' '
      const next = `${before}${prefix}${refs}${suffix}${after}`
      const caret = before.length + prefix.length + refs.length + suffix.length
      setText(next)
      window.requestAnimationFrame(() => {
        taRef.current?.focus()
        taRef.current?.setSelectionRange(caret, caret)
      })
    } catch (err) {
      console.error('pickFiles failed', err)
    }
  }

  const meta = state?.meta
  const status = state?.status
  const modelName = meta?.modelConfigName ?? tab.selectedModel ?? ''
  const activeModel = state?.models.find((model) => model.name === modelName)
  const modelLabel = compactModelLabel(modelName, activeModel?.model)
  const tokens = status && status.contextBudget >= 10_000
    ? `${fmt(status.lastInputTokens)} / ${fmt(status.contextBudget)}`
    : null

  return (
    <div data-composer-root className="session-bottom-gutter relative bg-pane pb-3.5 pl-6">
      {/* Fade overlay: content behind composer fades into pane bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-9 h-9"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--color-pane))' }}
      />

      <div data-composer-shell className="relative mx-auto max-w-[840px]">
        <div className="input-focus-shell rounded-[14px] border border-line-soft bg-pane-2 px-3.5 py-2 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey) {
                e.preventDefault()
                void send()
                return
              }
              if (
                (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
                !e.shiftKey &&
                !e.metaKey &&
                !e.altKey &&
                shouldNavigatePromptHistory(e.currentTarget, e.key === 'ArrowUp' ? -1 : 1)
              ) {
                e.preventDefault()
                navigateHistory(e.key === 'ArrowUp' ? -1 : 1)
              }
            }}
            aria-label="Message agent"
            placeholder="Message agent"
            rows={1}
            className="composer-input block w-full resize-none bg-transparent px-0.5 py-1 text-[16px] leading-[1.45] text-ink outline-none placeholder:text-ink-3"
            style={{ minHeight: 34, maxHeight: 140, overflowY: 'auto' }}
          />
          <div className="mt-1.5 flex h-8 items-center gap-1">
            <StatusPill label="Attach file" onClick={() => void attachFiles()}>
              <Paperclip className="h-3.5 w-3.5" strokeWidth={1.6} />
            </StatusPill>
            {promptHistory.length > 0 && (
              <StatusPill label="Prompt history" onClick={() => navigateHistory(-1)}>
                <History className="h-3.5 w-3.5" strokeWidth={1.6} />
              </StatusPill>
            )}
            <WorkspaceContextChip workDir={tab.workDir} />
            <div className="flex-1" />
            {tokens && (
              <span className="mr-1 shrink-0 tabular-nums text-[13px] text-ink-3">
                {tokens}
              </span>
            )}
            <PermissionPicker
              current={status?.permissionMode ?? 'reversible'}
              onSelect={async (mode) => {
                if (isDraft) return
                await api.rpc.request(tab.tabId, 'session.setPermissionMode', { mode })
                await refreshStatus(tab.tabId)
              }}
            />
            <ModelPicker
              current={modelName}
              label={modelLabel}
              models={state?.models ?? []}
              onSelect={(name) => selectModel(tab.tabId, name)}
            />
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
              aria-label="Toggle theme"
              className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" strokeWidth={1.6} />
              ) : (
                <Moon className="h-3.5 w-3.5" strokeWidth={1.6} />
              )}
            </button>
            {disabled ? (
              <button
                type="button"
                onClick={interrupt}
                className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
                title="Interrupt"
                aria-label="Interrupt"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim()}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-[10px] transition',
                  text.trim()
                    ? 'bg-ink text-pane hover:opacity-90'
                    : 'text-ink-3 hover:bg-line-soft',
                )}
                title="Send"
                aria-label="Send"
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkspaceContextChip({ workDir }: { workDir: string }): JSX.Element {
  const name = projectName(workDir)
  const path = shortPath(workDir)
  return (
    <StatusPill label={`Open workspace: ${workDir}`} onClick={() => void api.workspace.openPath(workDir)}>
      <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
      <span className="hidden max-w-[120px] truncate whitespace-nowrap sm:inline">{name}</span>
      <span className="mono hidden max-w-[150px] truncate whitespace-nowrap text-[12px] font-normal text-ink-4 lg:inline">
        {path !== name ? path : ''}
      </span>
    </StatusPill>
  )
}

function PermissionPicker({
  current,
  onSelect,
}: {
  current: PermissionMode
  onSelect: (mode: PermissionMode) => void | Promise<void>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <StatusPill
        label={`Permission: ${PERMISSION_LABELS[current]}`}
        onClick={() => setOpen((v) => !v)}
        expanded={open}
        hasPopup="menu"
      >
        <Shield className="h-[11px] w-[11px]" strokeWidth={1.8} />
        <span className="hidden max-w-[86px] truncate whitespace-nowrap sm:inline">
          {PERMISSION_LABELS[current]}
        </span>
        <ChevronDown className={cn('h-[9px] w-[9px] opacity-50 transition-transform', open && 'rotate-180')} strokeWidth={2} />
      </StatusPill>
      {open && (
        <div
          data-permission-menu
          role="menu"
          aria-label="Permission mode"
          className="absolute bottom-full right-0 z-50 mb-2 w-[224px] overflow-hidden rounded-[14px] border border-line bg-pane-2 p-1.5 shadow-2xl"
        >
          {PERMISSION_MODES.map((mode) => {
            const active = mode === current
            return (
              <button
                type="button"
                key={mode}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false)
                  void onSelect(mode)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition',
                  active ? 'bg-line-soft text-ink' : 'text-ink-2 hover:bg-line-soft/70 hover:text-ink',
                )}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center">
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.2} />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.7} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{PERMISSION_LABELS[mode]}</span>
                  <span className="block truncate text-[12px] text-ink-3">{PERMISSION_HINTS[mode]}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ModelPicker({
  current,
  label,
  models,
  onSelect,
}: {
  current: string
  label: string
  models: readonly ModelDescriptor[]
  onSelect: (name: string) => void | Promise<void>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const accessibleLabel = `Model: ${label || current || 'none'}`
  const filtered = orderModelPickerItems(models, current, query)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    window.requestAnimationFrame(() => inputRef.current?.focus())
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <StatusPill
        label={accessibleLabel}
        onClick={() => setOpen((v) => !v)}
        expanded={open}
        hasPopup="dialog"
      >
        <Zap className="h-[11px] w-[11px]" strokeWidth={1.8} />
        <span
          className="truncate whitespace-nowrap"
          style={{ maxWidth: 'clamp(120px, 24vw, 250px)' }}
        >
          {label || current || 'no model'}
        </span>
        <ChevronDown className={cn('h-[9px] w-[9px] opacity-50 transition-transform', open && 'rotate-180')} strokeWidth={2} />
      </StatusPill>
      {open && (
        <div
          data-model-menu
          role="dialog"
          aria-label="Select model"
          className="absolute bottom-full right-0 z-50 mb-2 overflow-hidden rounded-[14px] border border-line bg-pane-2 shadow-2xl"
          style={{ width: 'min(420px, calc(100vw - 32px))' }}
        >
          <div className="border-b border-line-soft px-3 py-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter models"
              placeholder="Filter models"
              className="model-filter-input w-full rounded-lg border border-line-soft bg-pane px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[14px] text-ink-4">No matching models</div>
            ) : (
              filtered.map((model) => {
                const active = model.name === current
                const displayName = compactModelLabel(model.name, model.model) || model.name
                const details = [
                  model.provider,
                  model.model && model.model !== displayName ? model.model : null,
                  fmt(model.contextLength),
                ].filter(Boolean).join(' · ')
                const ariaName = displayName === model.name ? displayName : `${displayName} (${model.name})`
                return (
                  <button
                    type="button"
                    key={model.name}
                    aria-label={`Select model ${ariaName}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => {
                      setOpen(false)
                      void onSelect(model.name)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition',
                      active ? 'bg-line-soft text-ink' : 'text-ink-2 hover:bg-line-soft/70 hover:text-ink',
                    )}
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center">
                      {active ? (
                        <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.2} />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.7} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{displayName}</div>
                      <div className="mono truncate text-[12px] text-ink-3">
                        {details}
                      </div>
                    </div>
                    {model.supportsThinking && <Brain className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.7} />}
                    {model.supportsMultimodal && <Image className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.7} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function orderModelPickerItems(
  models: readonly ModelDescriptor[],
  current: string,
  query: string,
): readonly ModelDescriptor[] {
  const q = query.trim().toLowerCase()
  const matching = models.filter((model) => {
    if (!q) return true
    return `${model.name} ${model.provider} ${model.model}`.toLowerCase().includes(q)
  })
  if (!current) return matching
  const currentIndex = matching.findIndex((model) => model.name === current)
  if (currentIndex <= 0) return matching
  const currentModel = matching[currentIndex]!
  return [
    currentModel,
    ...matching.slice(0, currentIndex),
    ...matching.slice(currentIndex + 1),
  ]
}

function formatAttachmentReference(filePath: string, workDir: string): string {
  const normalizedWorkDir = workDir.endsWith('/') ? workDir : `${workDir}/`
  const ref = filePath.startsWith(normalizedWorkDir)
    ? filePath.slice(normalizedWorkDir.length)
    : filePath
  if (!/\s/.test(ref)) return `@${ref}`
  if (!ref.includes('"')) return `@"${ref}"`
  if (!ref.includes("'")) return `@'${ref}'`
  return `@${ref}`
}

function promptHistoryKey(workDir: string): string {
  return `fermi:promptHistory:${workDir}`
}

function readPromptHistory(workDir: string): readonly string[] {
  try {
    const raw = localStorage.getItem(promptHistoryKey(workDir))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(-MAX_PROMPT_HISTORY)
  } catch {
    return []
  }
}

function addPromptHistoryEntry(
  workDir: string,
  current: readonly string[],
  input: string,
): readonly string[] {
  const normalized = input.trim()
  if (!normalized) return current
  const deduped = current.filter((item) => item !== normalized)
  const next = [...deduped, normalized].slice(-MAX_PROMPT_HISTORY)
  try {
    localStorage.setItem(promptHistoryKey(workDir), JSON.stringify(next))
  } catch {
    // Persistence is convenience only; keep the in-memory history usable.
  }
  return next
}

function shouldNavigatePromptHistory(
  textarea: HTMLTextAreaElement,
  direction: -1 | 1,
): boolean {
  if (textarea.selectionStart !== textarea.selectionEnd) return false
  const cursor = textarea.selectionStart
  if (textarea.value.length === 0) return true
  if (direction === -1) {
    return cursor === 0 || !textarea.value.slice(0, cursor).includes('\n')
  }
  return cursor === textarea.value.length || !textarea.value.slice(cursor).includes('\n')
}

function StatusPill({
  children,
  expanded,
  hasPopup,
  label,
  onClick,
}: {
  children: React.ReactNode
  expanded?: boolean
  hasPopup?: 'menu' | 'listbox' | 'dialog'
  label?: string
  onClick?: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      title={label}
      className="inline-flex h-8 min-w-8 items-center justify-center gap-[5px] rounded-[10px] px-2.5 text-[13.5px] font-medium text-ink-2 transition hover:bg-line-soft hover:text-ink"
    >
      {children}
    </button>
  )
}
