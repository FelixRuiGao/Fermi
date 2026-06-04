import React, { useState } from "react";
import { useStore } from "../store.js";
import { rpcRequest } from "../vscode-api.js";

interface SessionItem {
  sessionId: string;
  title?: string;
  lastActive?: string;
}

export function HeaderBar() {
  const meta = useStore((s) => s.meta);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleNewSession = () => {
    rpcRequest("__ext.newSession");
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

  const title = meta?.title || meta?.displayName || "Fermi";
  const shortTitle = title.length > 30 ? title.slice(0, 28) + "..." : title;

  return (
    <>
      <div className="header-bar">
        <span className="header-title" title={title}>{shortTitle}</span>
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
          {loading && <div className="session-item">Loading...</div>}
          {!loading && sessions.length === 0 && (
            <div className="session-item" style={{ opacity: 0.5 }}>No saved sessions</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.sessionId}
              className="session-item"
              onClick={() => handleRestoreSession(s.sessionId)}
            >
              <span className="session-title">{s.title || s.sessionId}</span>
              {s.lastActive && (
                <span className="session-time">{formatRelativeTime(s.lastActive)}</span>
              )}
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
    return `${days}d ago`;
  } catch {
    return "";
  }
}
