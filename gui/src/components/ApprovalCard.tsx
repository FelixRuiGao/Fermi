/**
 * Inline ask surface between the transcript and composer. Renders the session's
 * pending ask straight from the store (`pendingAsk`, a full PendingAskUi):
 *   - approval → the server's ready-made offers (allow once / always / deny),
 *     indexed straight into resolveApprovalAsk; Deny is a separate RPC
 *   - agent_question → structured questions with per-question answers and
 *     custom_input, resolved through resolveAgentQuestionAsk
 */

import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, ShieldCheck, HelpCircle, Check, X } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { useSessionStore } from '@/state/sessionStore.js'
import type {
  AgentQuestionAnswer,
  AgentQuestionItem,
  ApprovalPayload,
  AskPayload,
  SessionTab,
} from '@shared/rpc.js'

export function AskBar({ tab }: { tab: SessionTab }): JSX.Element | null {
  const ask = useSessionStore((s) => s.perTab[tab.tabId]?.pendingAsk ?? null)
  if (!ask || tab.status === 'draft') return null
  if (ask.kind === 'agent_question') return <QuestionCard tab={tab} ask={ask} />
  return <ApprovalCard tab={tab} ask={ask} />
}

function Shell({ children, danger }: { children: React.ReactNode; danger?: boolean }): JSX.Element {
  return (
    <div className="px-6 pb-2 pt-1">
      <div className="mx-auto max-w-[840px]">
        <div className={cn('rounded-xl border bg-pane-2', danger ? 'border-error/40' : 'border-line')}>{children}</div>
      </div>
    </div>
  )
}

function ApprovalCard({ tab, ask }: { tab: SessionTab; ask: AskPayload }): JSX.Element {
  const resolve = useSessionStore((s) => s.resolveApprovalAsk)
  const deny = useSessionStore((s) => s.denyAsk)
  const [selected, setSelected] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const payload = ask.payload as unknown as Partial<ApprovalPayload>
  const options = ask.options ?? []
  const offers = payload.offers ?? []
  const toolName = payload.toolName ?? ask.source.toolName ?? ''
  const summary = typeof payload.toolSummary === 'string' ? payload.toolSummary : ask.summary
  const permissionClass = payload.permissionClass ?? ''
  const isDangerous = permissionClass.includes('danger')
  const denyIndex = options.findIndex((o) => /^deny|reject|no\b/i.test(o))

  useEffect(() => {
    setSelected(0)
    setSubmitting(false)
  }, [ask.id])

  const run = async (idx: number): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      await resolve(tab.tabId, ask.id, idx)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
      if (submitting) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(0, Math.min(options.length - 1, s + (e.key === 'ArrowDown' ? 1 : -1))))
      } else if (e.key === 'Enter' && !typing) {
        e.preventDefault()
        void run(selected)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (denyIndex >= 0) void run(denyIndex)
        else void deny(tab.tabId)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selected, submitting, options.length, denyIndex, tab.tabId])

  return (
    <Shell danger={isDangerous}>
      <div className="flex items-start gap-3 px-4 pb-2 pt-3.5">
        <div
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-full',
            isDangerous ? 'bg-error/15 text-error' : 'bg-warning/15 text-warning',
          )}
        >
          {isDangerous ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[14.5px] font-medium text-ink">Permission required</span>
            {permissionClass && <span className="mono text-[12px] text-ink-3">{permissionClass.replaceAll('_', ' ')}</span>}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-[15px] text-ink-2">{summary}</div>
          {typeof payload.persistentWarning === 'string' && payload.persistentWarning && (
            <div className="mt-1 text-[12.5px] text-ink-4">{payload.persistentWarning}</div>
          )}
        </div>
      </div>

      <ul className="px-2 pb-2">
        {options.map((label, i) => {
          const offer = offers[i]
          const isDeny = i === denyIndex
          const active = i === selected
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => void run(i)}
                onMouseEnter={() => setSelected(i)}
                disabled={submitting}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                  active ? 'bg-line-soft text-ink' : 'text-ink-2 hover:bg-line-soft/60',
                  isDeny && active && 'text-error',
                )}
              >
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                    isDeny
                      ? active
                        ? 'border-error/40 bg-error/15 text-error'
                        : 'border-line text-ink-3'
                      : active
                        ? 'border-success/40 bg-success/15 text-success'
                        : 'border-line text-ink-3',
                  )}
                >
                  {isDeny ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1 truncate text-[14.5px]">{label}</span>
                {offer?.scope && <span className="mono shrink-0 text-[12px] text-ink-3">{offer.scope}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-line-soft px-4 py-2">
        <span className="mono truncate text-[12px] text-ink-4">{toolName}</span>
        <span className="text-[12px] text-ink-4">↑↓ select · Enter confirm · Esc deny</span>
      </div>
    </Shell>
  )
}

function QuestionCard({ tab, ask }: { tab: SessionTab; ask: AskPayload }): JSX.Element {
  const resolve = useSessionStore((s) => s.resolveAgentQuestionAsk)
  const deny = useSessionStore((s) => s.denyAsk)
  const questions = useMemo(() => {
    const q = (ask.payload as { questions?: unknown }).questions
    return Array.isArray(q) ? (q as AgentQuestionItem[]) : []
  }, [ask])

  const [answers, setAnswers] = useState<AgentQuestionAnswer[]>([])
  const [customFor, setCustomFor] = useState<number | null>(null)
  const [customText, setCustomText] = useState('')
  const current = answers.length
  const question = questions[current]

  useEffect(() => {
    setAnswers([])
    setCustomFor(null)
    setCustomText('')
  }, [ask.id])

  useEffect(() => {
    if (questions.length > 0 && answers.length === questions.length) {
      void resolve(tab.tabId, ask.id, answers)
    }
  }, [answers, questions.length, ask.id, tab.tabId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && customFor === null) {
        e.preventDefault()
        void deny(tab.tabId)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [customFor, tab.tabId])

  const pick = (optionIndex: number): void => {
    const opt = question?.options[optionIndex]
    if (!opt) return
    if (opt.kind === 'custom_input') {
      setCustomFor(optionIndex)
      setCustomText('')
      return
    }
    setAnswers((prev) => [...prev, { questionIndex: current, selectedOptionIndex: optionIndex, answerText: opt.label }])
    setCustomFor(null)
  }

  const submitCustom = (): void => {
    if (customFor === null || !customText.trim()) return
    setAnswers((prev) => [...prev, { questionIndex: current, selectedOptionIndex: customFor, answerText: customText.trim() }])
    setCustomFor(null)
    setCustomText('')
  }

  if (!question) {
    return (
      <Shell>
        <div className="flex items-center gap-2 px-4 pb-1 pt-3.5">
          <HelpCircle className="h-4 w-4 text-accent" />
          <span className="text-[14.5px] font-medium text-ink">Question</span>
        </div>
        {ask.summary && <div className="px-4 pb-3 text-[14.5px] text-ink-2">{ask.summary}</div>}
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {(ask.options ?? []).map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void resolve(tab.tabId, ask.id, [{ questionIndex: 0, selectedOptionIndex: i, answerText: label }])}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[14px] transition',
                i === 0 ? 'bg-ink text-pane' : 'bg-line-soft text-ink-2 hover:bg-line hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <HelpCircle className="h-4 w-4 text-accent" />
        <span className="text-[14.5px] font-medium text-ink">
          {questions.length > 1 ? `Question ${current + 1} of ${questions.length}` : 'Question'}
        </span>
      </div>
      <div className="px-4 pt-1.5 text-[15px] text-ink">{question.question}</div>
      <div className="flex flex-col gap-1 p-2 px-4 pb-3">
        {question.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => pick(i)}
            className={cn(
              'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition',
              customFor === i ? 'border-accent bg-accent/10' : 'border-line-soft hover:border-line hover:bg-line-soft/50',
            )}
          >
            <span className="text-[14px] text-ink-2">{opt.label}</span>
            {opt.description && <span className="text-[12.5px] text-ink-4">{opt.description}</span>}
          </button>
        ))}
        {customFor !== null && (
          <div className="mt-1 flex gap-2">
            <input
              autoFocus
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCustom()
                if (e.key === 'Escape') setCustomFor(null)
              }}
              placeholder="Type your answer…"
              className="h-9 flex-1 rounded-lg border border-line-soft bg-pane px-3 text-[14px] text-ink outline-none focus:border-line"
            />
            <button
              type="button"
              onClick={submitCustom}
              disabled={!customText.trim()}
              className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-pane transition hover:opacity-90 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        )}
        {answers.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            {answers.map((a, i) => (
              <div key={i} className="flex items-baseline gap-1.5 text-[12.5px]">
                <Check className="h-3 w-3 shrink-0 translate-y-0.5 text-success" />
                <span className="text-ink-4">{questions[a.questionIndex]?.question}</span>
                <span className="text-ink-2">{a.answerText}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
