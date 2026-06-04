import React, { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "../store.js";
import { onEvent, rpcRequest } from "../vscode-api.js";
import { SlashCommandPanel, SLASH_COMMANDS, type SlashCommandDef } from "./SlashCommandPanel.js";

const PERM_COLORS: Record<string, string> = {
  yolo: "#4ec954",
  reversible: "#e8a838",
  read_only: "#e05252",
};

export function InputArea() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Array<{ path: string; selection?: string }>>([]);
  const [showSlashPanel, setShowSlashPanel] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submitTurn = useStore((s) => s.submitTurn);
  const isRunning = useStore((s) => s.status?.currentTurnRunning ?? false);
  const interruptTurn = useStore((s) => s.interruptTurn);
  const meta = useStore((s) => s.meta);
  const status = useStore((s) => s.status);

  useEffect(() => {
    return onEvent("__file-context", (params: unknown) => {
      const p = params as { filePath: string; selection?: string };
      setFiles((prev) => {
        if (prev.some((f) => f.path === p.filePath)) return prev;
        return [...prev, { path: p.filePath, selection: p.selection }];
      });
      textareaRef.current?.focus();
    });
  }, []);

  const handleSlashCommand = useCallback((cmd: SlashCommandDef) => {
    setShowSlashPanel(false);
    if (cmd.clientAction) {
      rpcRequest(cmd.clientAction, {});
      setInput("");
      return;
    }
    submitTurn(cmd.name);
    setInput("");
  }, [submitTurn]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && files.length === 0) return;

    if (trimmed.startsWith("/")) {
      const cmd = SLASH_COMMANDS.find((c) => c.name === trimmed || trimmed.startsWith(c.name + " "));
      if (cmd?.clientAction) {
        handleSlashCommand(cmd);
        return;
      }
    }

    let fullInput = "";
    for (const f of files) {
      fullInput += `@${f.path}\n`;
    }
    fullInput += trimmed;

    submitTurn(fullInput);
    setInput("");
    setFiles([]);
    setShowSlashPanel(false);
  }, [input, files, submitTurn, handleSlashCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSlashPanel) return; // keyboard handled by SlashCommandPanel
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape" && isRunning) {
        interruptTurn();
      }
    },
    [handleSubmit, isRunning, interruptTurn, showSlashPanel],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const trimmed = val.trimStart();
    setShowSlashPanel(trimmed.startsWith("/") && !trimmed.includes(" ") && !trimmed.includes("\n"));
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  const removeFile = (path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  };

  const permMode = status?.permissionMode ?? "reversible";
  const permColor = PERM_COLORS[permMode] ?? PERM_COLORS.reversible;
  const shortModel = meta?.modelConfigName
    ? (meta.modelConfigName.includes(":") ? meta.modelConfigName.split(":")[1] : meta.modelConfigName)
    : "No model";

  const tokens = status?.lastInputTokens ?? 0;
  const budget = status?.contextBudget ?? 0;
  const pct = budget > 0 ? Math.round((tokens / budget) * 100) : 0;

  return (
    <div className="input-area">
      {files.length > 0 && (
        <div className="file-tags">
          {files.map((f) => (
            <span key={f.path} className="file-tag">
              @{f.path}
              <span className="file-tag-remove" onClick={() => removeFile(f.path)}>×</span>
            </span>
          ))}
        </div>
      )}

      {showSlashPanel && (
        <SlashCommandPanel
          filter={input.trimStart()}
          onSelect={handleSlashCommand}
          onClose={() => { setShowSlashPanel(false); textareaRef.current?.focus(); }}
        />
      )}

      <div className="input-box">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? "Working..." : "Ask Fermi..."}
          rows={1}
        />
        <div className="input-inner-toolbar">
          <button className="itool-btn" onClick={() => rpcRequest("__ext.addFile")} title="Attach file">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a.5.5 0 0 1 .5.5v6h6a.5.5 0 0 1 0 1h-6v6a.5.5 0 0 1-1 0v-6h-6a.5.5 0 0 1 0-1h6v-6A.5.5 0 0 1 8 1z"/></svg>
          </button>
          <button className="itool-btn" title={`Permission: ${permMode}`}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill={permColor}><path d="M8 1l5 2v4c0 3.5-2.2 6.5-5 8-2.8-1.5-5-4.5-5-8V3l5-2z"/></svg>
          </button>
          <div style={{ flex: 1 }} />
          {isRunning ? (
            <button className="send-btn send-btn-stop" onClick={() => interruptTurn()} title="Stop">■</button>
          ) : (
            <button className="send-btn" onClick={handleSubmit} disabled={!input.trim() && files.length === 0} title="Send (Enter)">↑</button>
          )}
        </div>
      </div>

      <div className="input-meta-row">
        <span className="meta-model" onClick={() => rpcRequest("__ext.selectModel")} title="Switch model">
          {shortModel}
        </span>
        <ContextRing tokens={tokens} cached={status?.lastCacheReadTokens ?? 0} budget={budget} pct={pct} />
      </div>
    </div>
  );
}

function ContextRing({ tokens, cached, budget, pct }: { tokens: number; cached: number; budget: number; pct: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const r = 8;
  const stroke = 2.5;
  const circ = 2 * Math.PI * r;
  const filled = circ * (pct / 100);

  return (
    <div className="context-ring-wrap" ref={ref}>
      <svg
        width="22" height="22" viewBox="0 0 22 22"
        className="context-ring"
        onClick={() => setOpen(!open)}
        title={`Context: ${pct}%`}
      >
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--vscode-foreground)" strokeOpacity="0.15" strokeWidth={stroke} />
        <circle
          cx="11" cy="11" r={r} fill="none"
          stroke={pct > 80 ? "#e05252" : pct > 50 ? "#e8a838" : "var(--vscode-textLink-foreground)"}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      </svg>
      {open && (
        <div className="context-popup">
          <div className="context-popup-row">
            <span>Used</span>
            <span>{formatTokens(tokens)}</span>
          </div>
          <div className="context-popup-row">
            <span>Cached</span>
            <span>{formatTokens(cached)}</span>
          </div>
          <div className="context-popup-row">
            <span>Budget</span>
            <span>{formatTokens(budget)}</span>
          </div>
          <div className="context-popup-row" style={{ fontWeight: 500 }}>
            <span>Usage</span>
            <span>{pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
