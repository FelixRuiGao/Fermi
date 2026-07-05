import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store.js";
import { IconWarning, IconHand, IconCheck } from "./icons.js";
import type {
  AskPayload,
  AgentQuestionItem,
  AgentQuestionAnswer,
  ApprovalPayload,
} from "../../src/types.js";

/**
 * Approval: the server ships ready-made options (allow once / allow always
 * with scope / …); index them straight into resolveApprovalAsk. Deny is a
 * separate RPC. Agent questions carry structured questions+options and
 * resolve through resolveAgentQuestionAsk with per-question answers.
 */

function ApprovalAsk({ ask }: { ask: AskPayload }) {
  const resolveAsk = useStore((s) => s.resolveAsk);
  const denyAsk = useStore((s) => s.denyAsk);
  const payload = ask.payload as unknown as Partial<ApprovalPayload>;
  const toolName = payload.toolName ?? ask.source.toolName;
  const preview = typeof payload.toolSummary === "string" ? payload.toolSummary : "";
  const options = ask.options ?? [];
  const denyInOptions = options.some((o) => /deny|reject|no\b/i.test(o));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Enter-to-approve must not fire while the user is typing a follow-up
      // in the composer (or any input) — that silently approved the tool.
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        void denyAsk();
      } else if (e.key === "Enter" && !typing && options.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        void resolveAsk(ask.id, 0);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [ask.id, options.length, resolveAsk, denyAsk]);

  return (
    <div className="ask-panel">
      <div className="ask-title">
        <IconWarning size={14} style={{ color: "var(--f-warn)" }} />
        Permission required
        {toolName && <span className="ask-tool">{toolName}</span>}
      </div>
      {ask.summary && <div className="ask-summary">{ask.summary}</div>}
      {preview && preview !== ask.summary && <div className="ask-preview">{preview}</div>}
      {typeof payload.persistentWarning === "string" && payload.persistentWarning && (
        <div className="ask-summary" style={{ color: "var(--f-faint)" }}>
          {payload.persistentWarning}
        </div>
      )}
      <div className="ask-buttons">
        {options.map((label, i) => (
          <button
            key={i}
            className={i === 0 ? "btn-approve" : "btn-secondary"}
            onClick={() => resolveAsk(ask.id, i)}
          >
            {label}
          </button>
        ))}
        {!denyInOptions && (
          <button className="btn-secondary" onClick={() => denyAsk()}>
            Deny (Esc)
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionAsk({ ask }: { ask: AskPayload }) {
  const resolveQuestionAsk = useStore((s) => s.resolveQuestionAsk);
  const denyAsk = useStore((s) => s.denyAsk);
  const questions = useMemo(() => {
    const q = (ask.payload as { questions?: unknown }).questions;
    return Array.isArray(q) ? (q as AgentQuestionItem[]) : [];
  }, [ask]);

  const [answers, setAnswers] = useState<AgentQuestionAnswer[]>([]);
  const [customText, setCustomText] = useState("");
  const [customFor, setCustomFor] = useState<number | null>(null);
  const current = answers.length;
  const question = questions[current];

  useEffect(() => {
    // Reset when a different ask arrives.
    setAnswers([]);
    setCustomFor(null);
    setCustomText("");
  }, [ask.id]);

  useEffect(() => {
    if (questions.length > 0 && answers.length === questions.length) {
      void resolveQuestionAsk(ask.id, answers);
    }
  }, [answers, questions.length, ask.id, resolveQuestionAsk]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && customFor === null) {
        e.preventDefault();
        e.stopPropagation();
        void denyAsk();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [denyAsk, customFor]);

  if (!question) {
    // Malformed payload — degrade to raw options if any.
    return (
      <div className="ask-panel ask-question">
        <div className="ask-title">
          <IconHand size={14} style={{ color: "var(--f-accent)" }} />
          Question
        </div>
        {ask.summary && <div className="ask-summary">{ask.summary}</div>}
        <div className="ask-buttons">
          {(ask.options ?? []).map((label, i) => (
            <button
              key={i}
              className={i === 0 ? "btn-approve" : "btn-secondary"}
              onClick={() =>
                resolveQuestionAsk(ask.id, [
                  { questionIndex: 0, selectedOptionIndex: i, answerText: label },
                ])
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const pick = (optionIndex: number) => {
    const opt = question.options[optionIndex];
    if (!opt) return;
    if (opt.kind === "custom_input") {
      setCustomFor(optionIndex);
      setCustomText("");
      return;
    }
    setAnswers((prev) => [
      ...prev,
      { questionIndex: current, selectedOptionIndex: optionIndex, answerText: opt.label },
    ]);
    setCustomFor(null);
  };

  const submitCustom = () => {
    if (customFor === null || !customText.trim()) return;
    setAnswers((prev) => [
      ...prev,
      { questionIndex: current, selectedOptionIndex: customFor, answerText: customText.trim() },
    ]);
    setCustomFor(null);
    setCustomText("");
  };

  return (
    <div className="ask-panel ask-question">
      <div className="ask-title">
        <IconHand size={14} style={{ color: "var(--f-accent)" }} />
        {questions.length > 1 ? `Question ${current + 1} of ${questions.length}` : "Question"}
      </div>
      <div className="ask-summary" style={{ color: "var(--f-fg)" }}>{question.question}</div>
      <div className="ask-choice-list">
        {question.options.map((opt, i) => (
          <button
            key={i}
            className={customFor === i ? "ask-choice selected" : "ask-choice"}
            onClick={() => pick(i)}
          >
            <span>{opt.label}</span>
            {opt.description && <span className="choice-desc">{opt.description}</span>}
          </button>
        ))}
      </div>
      {customFor !== null && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            className="init-input"
            style={{ marginTop: 0, flex: 1 }}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCustom();
              if (e.key === "Escape") setCustomFor(null);
            }}
            placeholder="Type your answer…"
            autoFocus
          />
          <button className="btn-approve" style={{ borderRadius: 6 }} onClick={submitCustom} disabled={!customText.trim()}>
            <IconCheck size={12} />
          </button>
        </div>
      )}
      {answers.length > 0 && (
        <div className="ask-summary" style={{ marginTop: 6, marginBottom: 0 }}>
          {answers.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
              <IconCheck size={10} style={{ color: "var(--f-ok)", flexShrink: 0 }} />
              <span style={{ color: "var(--f-faint)" }}>{questions[a.questionIndex]?.question}</span>
              <span>{a.answerText}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AskPanel() {
  const pendingAsk = useStore((s) => s.pendingAsk);
  if (!pendingAsk) return null;
  if (pendingAsk.kind === "agent_question") return <QuestionAsk ask={pendingAsk} />;
  return <ApprovalAsk ask={pendingAsk} />;
}
