/**
 * Collapsible plan glance-bar pinned below the session header, driven by the
 * server's plan.changed events (the model's plan.md checkboxes). Collapsed it
 * shows the active step + progress; expanded it lists the checklist. The right
 * column mirrors the full checklist as a persistent overview.
 */

import { useState } from 'react'
import { ChevronRight, CircleDot, ListChecks } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { useSessionStore } from '@/state/sessionStore.js'

export function PlanBar({ tabId }: { tabId: string }): JSX.Element | null {
  const plan = useSessionStore((s) => s.perTab[tabId]?.plan ?? [])
  const [expanded, setExpanded] = useState(false)

  if (plan.length === 0) return null
  const done = plan.filter((p) => p.status === 'done').length
  const active = plan.find((p) => p.status === 'active')

  return (
    <div className="hairline-b bg-pane">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-2 text-left transition hover:bg-line-soft/30"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-ink-4 transition-transform', expanded && 'rotate-90')}
          strokeWidth={2}
        />
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.7} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
          {expanded ? 'Plan' : active ? active.text : 'Plan'}
        </span>
        <span className="mono shrink-0 rounded-full bg-line-soft px-2 py-0.5 text-[11.5px] text-ink-3">
          {done}/{plan.length}
        </span>
      </button>
      {expanded && (
        <div className="px-6 pb-2.5 pl-11">
          {plan.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 text-[13px]">
              <span className="mt-0.5 shrink-0">
                {item.status === 'done' ? (
                  <span className="text-success">✓</span>
                ) : item.status === 'active' ? (
                  <CircleDot className="h-3 w-3 text-accent" strokeWidth={2} />
                ) : (
                  <span className="text-ink-4">○</span>
                )}
              </span>
              <span
                className={cn(
                  'leading-[1.4]',
                  item.status === 'done'
                    ? 'text-ink-4 line-through'
                    : item.status === 'active'
                      ? 'text-ink'
                      : 'text-ink-2',
                )}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
