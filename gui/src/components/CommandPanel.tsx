/**
 * Command panel — the picker/input/text stack that a slash command opens,
 * floating above the composer. Every command that needs a choice drills down
 * here (no typed sub-arguments). ↑↓ move, Enter runs, Space toggles a checkbox
 * item, Esc goes back / closes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import {
  COMMAND_GROUPS,
  filterCommands,
  type InputSpec,
  type PanelView,
  type PickerSpec,
  type SlashCommand,
  type TextSpec,
} from '@/lib/commands.js'

type ViewState =
  | { kind: 'commands' }
  | { kind: 'loading' }
  | { kind: 'picker'; spec: PickerSpec }
  | { kind: 'input'; spec: InputSpec }
  | { kind: 'text'; spec: TextSpec }

export function CommandPanel({
  commands,
  filter,
  onClose,
  onFlowStarted,
  onCommandRun,
}: {
  commands: SlashCommand[]
  filter: string
  onClose: () => void
  onFlowStarted: () => void
  onCommandRun: () => void
}): JSX.Element | null {
  const [stack, setStack] = useState<ViewState[]>([{ kind: 'commands' }])
  const [selected, setSelected] = useState(0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [inputText, setInputText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const view = stack[stack.length - 1]!

  const filtered = useMemo(() => filterCommands(commands, filter), [commands, filter])

  const commandRows = useMemo(() => {
    const rows: Array<{ header?: string; cmd?: SlashCommand }> = []
    for (const group of COMMAND_GROUPS) {
      const inGroup = filtered.filter((c) => c.group === group)
      if (inGroup.length === 0) continue
      rows.push({ header: group })
      for (const cmd of inGroup) rows.push({ cmd })
    }
    return rows
  }, [filtered])

  const selectableIndices = useMemo(() => {
    if (view.kind === 'commands') return commandRows.map((r, i) => (r.cmd ? i : -1)).filter((i) => i >= 0)
    if (view.kind === 'picker') return view.spec.items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)
    return []
  }, [view, commandRows])

  useEffect(() => {
    setSelected(selectableIndices[0] ?? 0)
  }, [selectableIndices])

  useEffect(() => {
    if (view.kind === 'picker' && view.spec.checkbox) {
      setChecked(new Set(view.spec.items.filter((i) => i.checked).map((i) => i.value)))
    }
    if (view.kind === 'input') setInputText(view.spec.initial ?? '')
  }, [view])

  const handleFlowResult = useCallback(
    async (result: void | PanelView | Promise<void | PanelView>, replaceLoading: boolean) => {
      try {
        const resolved = await result
        if (resolved) {
          setStack((prev) => {
            const base = replaceLoading && prev[prev.length - 1]?.kind === 'loading' ? prev.slice(0, -1) : prev
            return [...base, resolved as ViewState]
          })
          onFlowStarted()
        } else {
          onClose()
        }
      } catch (err) {
        setStack((prev) => {
          const base = prev[prev.length - 1]?.kind === 'loading' ? prev.slice(0, -1) : prev
          return [...base, { kind: 'text', spec: { title: 'Error', body: err instanceof Error ? err.message : String(err) } }]
        })
        onFlowStarted()
      }
    },
    [onClose, onFlowStarted],
  )

  const runCommand = useCallback(
    (cmd: SlashCommand) => {
      const result = cmd.run()
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setStack((prev) => [...prev, { kind: 'loading' }])
        onFlowStarted()
        void handleFlowResult(result, true)
      } else if (result) {
        void handleFlowResult(result, false)
      } else {
        onCommandRun()
        onClose()
      }
    },
    [handleFlowResult, onFlowStarted, onCommandRun, onClose],
  )

  const goBack = useCallback(() => {
    setStack((prev) => {
      if (prev.length <= 1) {
        onClose()
        return prev
      }
      const next = prev.slice(0, -1)
      if (next.length === 1 && next[0]!.kind === 'commands') {
        onClose()
        return prev
      }
      return next
    })
  }, [onClose])

  const activate = useCallback(
    (index: number) => {
      if (view.kind === 'commands') {
        const row = commandRows[index]
        if (row?.cmd) runCommand(row.cmd)
        return
      }
      if (view.kind === 'picker') {
        const item = view.spec.items[index]
        if (!item || item.disabled) return
        if (view.spec.checkbox) {
          setChecked((prev) => {
            const next = new Set(prev)
            if (next.has(item.value)) next.delete(item.value)
            else next.add(item.value)
            return next
          })
          return
        }
        if (view.spec.onSelect) {
          const result = view.spec.onSelect(item.value)
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            setStack((prev) => [...prev, { kind: 'loading' }])
            void handleFlowResult(result, true)
          } else {
            void handleFlowResult(result, false)
          }
        }
      }
    },
    [view, commandRows, runCommand, handleFlowResult],
  )

  const commitCheckbox = useCallback(() => {
    if (view.kind !== 'picker' || !view.spec.checkbox || !view.spec.onCommit) return
    const result = view.spec.onCommit([...checked])
    setStack((prev) => [...prev, { kind: 'loading' }])
    void handleFlowResult(result, true)
  }, [view, checked, handleFlowResult])

  useEffect(() => {
    if (view.kind === 'input' || view.kind === 'loading') return
    const handler = (e: KeyboardEvent): void => {
      if (view.kind === 'text') {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          goBack()
        }
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const pos = selectableIndices.indexOf(selected)
        const nextPos = e.key === 'ArrowDown' ? Math.min(pos + 1, selectableIndices.length - 1) : Math.max(pos - 1, 0)
        setSelected(selectableIndices[nextPos] ?? selected)
      } else if (e.key === 'Enter' || (view.kind === 'commands' && e.key === 'Tab')) {
        e.preventDefault()
        e.stopPropagation()
        if (view.kind === 'picker' && view.spec.checkbox) commitCheckbox()
        else activate(selected)
      } else if (e.key === ' ' && view.kind === 'picker' && view.spec.checkbox) {
        e.preventDefault()
        e.stopPropagation()
        activate(selected)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        goBack()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [view, selected, selectableIndices, activate, goBack, commitCheckbox])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, view])

  if (view.kind === 'commands' && commandRows.length === 0) return null

  return (
    <div
      ref={listRef}
      className="mb-2 max-h-[min(420px,50vh)] overflow-y-auto rounded-xl border border-line bg-pane-2 p-1.5 shadow-2xl"
    >
      {view.kind === 'commands' &&
        commandRows.map((row, i) =>
          row.header ? (
            <div
              key={`h-${row.header}`}
              className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4 first:pt-1"
            >
              {row.header}
            </div>
          ) : (
            <button
              key={row.cmd!.name}
              type="button"
              data-idx={i}
              onClick={() => activate(i)}
              onMouseEnter={() => setSelected(i)}
              className={cn(
                'flex w-full items-baseline gap-3 rounded-lg px-3 py-1.5 text-left transition',
                i === selected ? 'bg-line-soft text-ink' : 'text-ink-2 hover:bg-line-soft/60',
              )}
            >
              <span className="mono shrink-0 text-[13.5px] font-medium text-accent">{row.cmd!.name}</span>
              <span className="truncate text-[13px] text-ink-3">{row.cmd!.description}</span>
            </button>
          ),
        )}

      {view.kind === 'loading' && <div className="px-3 py-3 text-[13.5px] text-ink-4">Loading…</div>}

      {view.kind === 'picker' && (
        <>
          <div className="px-3 pb-1 pt-1.5 text-[12px] font-semibold text-ink-3">{view.spec.title}</div>
          {view.spec.items.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-ink-4">{view.spec.emptyText ?? 'Nothing here'}</div>
          )}
          {view.spec.items.map((item, i) => (
            <button
              key={`${item.value}-${i}`}
              type="button"
              data-idx={i}
              disabled={item.disabled}
              onClick={() => !item.disabled && activate(i)}
              onMouseEnter={() => !item.disabled && setSelected(i)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition',
                item.disabled
                  ? 'cursor-default text-ink-4'
                  : i === selected
                    ? 'bg-line-soft text-ink'
                    : 'text-ink-2 hover:bg-line-soft/60',
              )}
            >
              {view.spec.checkbox && !item.disabled && (
                <span className={cn('grid h-4 w-4 shrink-0 place-items-center', checked.has(item.value) ? 'text-accent' : 'text-ink-4')}>
                  {checked.has(item.value) ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : <span className="h-3 w-3 rounded-sm border border-current" />}
                </span>
              )}
              <span className="min-w-0 shrink-0 text-[14px] font-medium">{item.label}</span>
              {item.description && <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-4">{item.description}</span>}
              {item.detail && <span className="ml-auto shrink-0 text-[12.5px] text-ink-4">{item.detail}</span>}
              {item.active && (
                <span className="ml-auto shrink-0 text-accent">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
              )}
              {!item.active && !item.detail && !view.spec.checkbox && view.spec.onSelect && !item.disabled && i === selected && (
                <span className="ml-auto shrink-0 text-ink-4">
                  <ChevronRight className="h-3 w-3" strokeWidth={2} />
                </span>
              )}
            </button>
          ))}
          {view.spec.checkbox && (
            <div className="px-3 py-1.5 text-[11.5px] text-ink-4">Space toggles · Enter applies · Esc cancels</div>
          )}
        </>
      )}

      {view.kind === 'input' && (
        <div className="p-2">
          <div className="px-1 pb-1.5 text-[12px] font-semibold text-ink-3">{view.spec.title}</div>
          <input
            autoFocus
            value={inputText}
            placeholder={view.spec.placeholder}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                if (!inputText.trim() && !view.spec.allowEmpty) return
                const result = view.spec.onSubmit(inputText)
                setStack((prev) => [...prev, { kind: 'loading' }])
                void handleFlowResult(result, true)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                goBack()
              }
            }}
            className="h-9 w-full rounded-lg border border-line-soft bg-pane px-3 text-[14px] text-ink outline-none focus:border-line"
          />
        </div>
      )}

      {view.kind === 'text' && (
        <div className="p-2">
          <div className="px-1 pb-1.5 text-[12px] font-semibold text-ink-3">{view.spec.title}</div>
          <pre
            className={cn(
              'max-h-[300px] overflow-auto whitespace-pre-wrap rounded-lg border border-line-soft bg-pane px-3 py-2 text-[13px] leading-[1.55] text-ink-2',
              view.spec.mono && 'mono',
            )}
          >
            {view.spec.body}
          </pre>
          <div className="px-1 pt-1.5 text-[11.5px] text-ink-4">Esc to close</div>
        </div>
      )}
    </div>
  )
}
