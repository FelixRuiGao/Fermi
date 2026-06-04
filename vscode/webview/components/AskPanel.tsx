import React from "react";
import { useStore } from "../store.js";

export function AskPanel() {
  const pendingAsk = useStore((s) => s.pendingAsk);
  const resolveAsk = useStore((s) => s.resolveAsk);
  const denyAsk = useStore((s) => s.denyAsk);

  if (!pendingAsk) return null;

  const isApproval = pendingAsk.kind === "tool_approval" || pendingAsk.kind === "approval";

  return (
    <div className="ask-panel">
      <div className="ask-title">
        ⚠ {isApproval ? "Permission Required" : "Question"}
      </div>
      {pendingAsk.toolName && (
        <div style={{ fontSize: "0.9em", opacity: 0.7, marginBottom: 4 }}>
          Tool: <strong>{pendingAsk.toolName}</strong>
        </div>
      )}
      {pendingAsk.command && (
        <div className="ask-preview">{pendingAsk.command}</div>
      )}
      {!pendingAsk.command && pendingAsk.summary && (
        <div className="ask-preview">{pendingAsk.summary}</div>
      )}
      <div className="ask-buttons">
        {isApproval ? (
          <>
            <button className="btn-approve" onClick={() => resolveAsk(pendingAsk.id, 0)}>
              Allow
            </button>
            <button className="btn-deny" onClick={() => denyAsk()}>
              Deny
            </button>
          </>
        ) : (
          pendingAsk.choices?.map((choice, i) => (
            <button
              key={i}
              className={i === 0 ? "btn-approve" : "btn-deny"}
              onClick={() => resolveAsk(pendingAsk.id, i)}
            >
              {choice.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
