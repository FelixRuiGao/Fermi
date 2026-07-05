import React, { useState } from "react";
import { useStore } from "../store.js";
import { rpcRequest } from "../vscode-api.js";
import { IconSparkle, IconHistory } from "./icons.js";
import type { SessionListItem } from "../../src/types.js";

const INITIAL_COUNT = 8;

function relativeTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  } catch {
    return "";
  }
}

function sessionTitle(s: SessionListItem): string {
  return s.title || s.summary || s.sessionId;
}

/**
 * Empty-session home: quiet wordmark + recent sessions of this workspace.
 * Click restores the session in place (server re-emits ready + log).
 */
export function Home() {
  const sessions = useStore((s) => s.sessions);
  const restoreSession = useStore((s) => s.restoreSession);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = showAll ? sessions : sessions.slice(0, INITIAL_COUNT);

  const handleOpen = async (s: SessionListItem) => {
    if (busy) return;
    setBusy(s.sessionId);
    try {
      await restoreSession(s.sessionId);
    } catch {
      // Restore can fail (e.g. a turn is somehow running) — open a tab instead.
      await rpcRequest("__ext.openSession", { sessionId: s.sessionId, title: sessionTitle(s) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="home">
      <div className="home-hero">
        <div className="wordmark">
          <span className="mark"><IconSparkle size={16} /></span>
          Fermi
        </div>
        <p>Ask a question or describe a task. Fermi works in this workspace.</p>
      </div>
      {sessions.length > 0 && (
        <div className="home-sessions">
          <div className="home-sessions-title">Recent sessions</div>
          {visible.map((s) => (
            <div
              key={s.sessionId}
              className="home-session-row"
              onClick={() => handleOpen(s)}
              style={busy === s.sessionId ? { opacity: 0.5 } : undefined}
            >
              <IconHistory size={13} style={{ color: "var(--f-faint)", flexShrink: 0 }} />
              <span className="home-session-title">{sessionTitle(s)}</span>
              <span className="home-session-meta">
                {typeof s.turns === "number" ? `${s.turns} turns · ` : ""}
                {relativeTime(s.lastActiveAt)}
              </span>
            </div>
          ))}
          {sessions.length > INITIAL_COUNT && !showAll && (
            <button className="home-view-all" onClick={() => setShowAll(true)}>
              View all ({sessions.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
