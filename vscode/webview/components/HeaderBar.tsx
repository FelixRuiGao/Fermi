import React, { useState } from "react";
import { useStore } from "../store.js";
import { rpcRequest } from "../vscode-api.js";

interface SessionItem {
  sessionId: string;
  path: string;
  title?: string;
  summary?: string;
  lastActiveAt: string;
  turns: number;
}

export function HeaderBar() {
  const meta = useStore((s) => s.meta);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleNewSession = () => {
    rpcRequest("__ext.newSession");
    setShowHistory(false);
  };

  const handleToggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setLoading(true);
    try {
      const list = await rpcRequest<SessionItem[]>("session.listProjectSessions");
      setSessions(list ?? []);
    } catch {
      setSessions([]);
    }
    setLoading(false);
    setShowHistory(true);
  };

  const handleRestoreSession = async (sessionId: string) => {
    try {
      await rpcRequest("session.restoreSession", { sessionId });
      setShowHistory(false);
    } catch {}
  };

  const title = meta?.title || meta?.displayName || "New session";

  return (
    <>
      <div className="header-bar">
        <span className="header-title" title={title}>{title}</span>
        <div className="header-actions">
          <button className="header-btn" onClick={handleToggleHistory} title="Session history">
            ⏱
          </button>
          <button className="header-btn" onClick={handleNewSession} title="New session">
            +
          </button>
        </div>
      </div>
      {showHistory && (
        <div className="session-list-dropdown">
          {loading && <div className="session-item" style={{ opacity: 0.5 }}>Loading...</div>}
          {!loading && sessions.length === 0 && (
            <div className="session-item" style={{ opacity: 0.4 }}>No saved sessions</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.sessionId}
              className="session-item"
              onClick={() => handleRestoreSession(s.sessionId)}
            >
              <div className="session-info">
                <span className="session-title">
                  {s.title || s.summary || s.sessionId}
                </span>
                <span className="session-meta">
                  {s.turns} turns · {formatRelativeTime(s.lastActiveAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function formatRelativeTime(isoString: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch {
    return "";
  }
}
