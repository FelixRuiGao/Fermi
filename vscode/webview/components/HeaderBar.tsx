import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store.js";
import { rpcRequest } from "../vscode-api.js";
import { IconHistory, IconPlus } from "./icons.js";
import type { SessionListItem } from "../../src/types.js";

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

export function HeaderBar() {
  const meta = useStore((s) => s.meta);
  const sessions = useStore((s) => s.sessions);
  const refreshSessions = useStore((s) => s.refreshSessions);
  const restoreSession = useStore((s) => s.restoreSession);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [historyOpen]);

  const title = meta?.title || meta?.displayName || "New session";

  const startRename = () => {
    setDraftTitle(meta?.title ?? "");
    setRenaming(true);
  };

  const commitRename = async () => {
    setRenaming(false);
    const next = draftTitle.trim();
    if (!next || next === meta?.title) return;
    try {
      await rpcRequest("session.setTitle", { title: next });
    } catch {}
  };

  const handleOpenHistory = () => {
    if (!historyOpen) void refreshSessions();
    setHistoryOpen(!historyOpen);
  };

  const handleRestore = async (s: SessionListItem) => {
    setHistoryOpen(false);
    try {
      await restoreSession(s.sessionId);
    } catch {
      await rpcRequest("__ext.openSession", { sessionId: s.sessionId, title: s.title || s.summary });
    }
  };

  return (
    <div className="header-bar" style={{ position: "relative" }}>
      {renaming ? (
        <input
          className="header-title-input"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          placeholder="Session title…"
          autoFocus
        />
      ) : (
        <span className="header-title" title="Rename session" onClick={startRename}>
          {title}
        </span>
      )}
      <div className="header-actions" ref={historyRef}>
        <button className="icon-btn" onClick={handleOpenHistory} title="Session history">
          <IconHistory size={15} />
        </button>
        <button className="icon-btn" onClick={() => rpcRequest("__ext.newSession")} title="New session">
          <IconPlus size={15} />
        </button>
        {historyOpen && (
          <div className="popup-menu" style={{ top: 30, right: 0, width: 280, maxHeight: 320, overflowY: "auto" }}>
            <div className="popup-title">Sessions</div>
            {sessions.length === 0 && (
              <div className="popup-item" style={{ color: "var(--f-faint)", cursor: "default" }}>
                No saved sessions
              </div>
            )}
            {sessions.map((s) => (
              <div key={s.sessionId} className="popup-item" onClick={() => handleRestore(s)}>
                <span className="pi-text">
                  <span className="pi-label">{s.title || s.summary || s.sessionId}</span>
                  <span className="pi-desc" style={{ display: "block" }}>
                    {typeof s.turns === "number" ? `${s.turns} turns · ` : ""}
                    {relativeTime(s.lastActiveAt)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
