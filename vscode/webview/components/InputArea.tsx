import React, { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "../store.js";
import { onEvent, rpcRequest } from "../vscode-api.js";
import { CommandPanel, type CommandPanelController } from "./CommandPanel.js";
import {
  IconPlus,
  IconSlash,
  IconArrowUp,
  IconStop,
  IconCheck,
  IconChevronDown,
  IconHand,
  IconZap,
  IconEye,
  IconX,
  IconBranch,
  IconFolder,
} from "./icons.js";

const PERM_MODES = [
  {
    mode: "reversible",
    label: "Approve edits",
    desc: "Ask before file changes",
    pillClass: "perm-pill",
    Icon: IconHand,
  },
  {
    mode: "yolo",
    label: "Full access",
    desc: "No approval needed",
    pillClass: "perm-pill perm-yolo",
    Icon: IconZap,
  },
  {
    mode: "read_only",
    label: "Read only",
    desc: "No file modifications",
    pillClass: "perm-pill perm-read",
    Icon: IconEye,
  },
] as const;

function permDef(mode: string) {
  return PERM_MODES.find((p) => p.mode === mode) ?? PERM_MODES[0];
}

/** Anchored popup that closes on outside mousedown. */
function usePopup(): [boolean, (v: boolean) => void, React.RefObject<HTMLDivElement | null>] {
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
  return [open, setOpen, ref];
}

export function InputArea() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Array<{ path: string; selection?: string }>>([]);
  const [showSlashPanel, setShowSlashPanel] = useState(false);
  const [slashViaButton, setSlashViaButton] = useState(false);
  const [panelInFlow, setPanelInFlow] = useState(false);
  const panelController = useRef<CommandPanelController | null>(null);
  const [fileQuery, setFileQuery] = useState<{ query: string; start: number } | null>(null);
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [fileSel, setFileSel] = useState(0);
  const [workspaceInfo, setWorkspaceInfo] = useState<{ workspaceName: string | null; branch: string | null }>({
    workspaceName: null,
    branch: null,
  });
  const [permOpen, setPermOpen, permRef] = usePopup();
  const [modelOpen, setModelOpen, modelRef] = usePopup();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitTurn = useStore((s) => s.submitTurn);
  const interruptTurn = useStore((s) => s.interruptTurn);
  const isRunning = useStore((s) => s.status?.currentTurnRunning ?? false);
  const meta = useStore((s) => s.meta);
  const status = useStore((s) => s.status);
  const models = useStore((s) => s.models);
  const hasConversation = useStore((s) => s.conversation.length > 0);
  const agentMode = useStore((s) => s.agentMode);
  const goal = useStore((s) => s.goal);

  useEffect(() => {
    rpcRequest<{ workspaceName: string | null; branch: string | null }>("__ext.getContext")
      .then(setWorkspaceInfo)
      .catch(() => {});
  }, []);

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

  const closeSlash = useCallback(() => {
    setShowSlashPanel(false);
    setSlashViaButton(false);
    setPanelInFlow(false);
    textareaRef.current?.focus();
  }, []);

  const handleFlowStarted = useCallback(() => {
    setPanelInFlow(true);
    setSlashViaButton(false);
    setInput("");
  }, []);

  const acceptFileSuggestion = useCallback(
    (path: string) => {
      if (!fileQuery) return;
      setFiles((prev) => (prev.some((f) => f.path === path) ? prev : [...prev, { path }]));
      setInput((prev) => prev.slice(0, fileQuery.start) + prev.slice(fileQuery.start + 1 + fileQuery.query.length));
      setFileQuery(null);
      textareaRef.current?.focus();
    },
    [fileQuery],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && files.length === 0) return;

    let fullInput = "";
    for (const f of files) {
      fullInput += `@${f.path}\n`;
    }
    fullInput += trimmed;

    submitTurn(fullInput);
    setInput("");
    setFiles([]);
    setShowSlashPanel(false);
  }, [input, files, submitTurn]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSlashPanel) return; // keyboard handled by CommandPanel
      if (fileQuery && fileResults.length > 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setFileSel((prev) =>
            e.key === "ArrowDown" ? Math.min(prev + 1, fileResults.length - 1) : Math.max(prev - 1, 0),
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          acceptFileSuggestion(fileResults[fileSel]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setFileQuery(null);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape" && isRunning) {
        interruptTurn();
      }
      if (e.key === "Tab" && e.shiftKey) {
        // Cycle permission mode, mirroring the TUI's Shift+Tab.
        e.preventDefault();
        const current = status?.permissionMode ?? "reversible";
        const idx = PERM_MODES.findIndex((p) => p.mode === current);
        const next = PERM_MODES[(idx + 1) % PERM_MODES.length];
        rpcRequest("session.setPermissionMode", { mode: next.mode });
      }
    },
    [handleSubmit, isRunning, interruptTurn, showSlashPanel, status?.permissionMode, fileQuery, fileResults, fileSel, acceptFileSuggestion],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // @file autocomplete: an @token immediately before the caret.
    const caret = e.target.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const m = before.match(/(^|\s)@([\w./\-]*)$/);
    setFileQuery(m ? { query: m[2], start: caret - m[2].length - 1 } : null);

    if (panelInFlow) return; // a picker flow owns the panel; typing won't close it
    const trimmed = val.trimStart();
    setSlashViaButton(false);
    setShowSlashPanel(trimmed.startsWith("/") && !trimmed.includes(" ") && !trimmed.includes("\n"));
  };

  useEffect(() => {
    if (!fileQuery) {
      setFileResults([]);
      return;
    }
    const timer = setTimeout(() => {
      rpcRequest<string[]>("__ext.searchFiles", { query: fileQuery.query })
        .then((results) => {
          setFileResults(results ?? []);
          setFileSel(0);
        })
        .catch(() => setFileResults([]));
    }, 120);
    return () => clearTimeout(timer);
  }, [fileQuery?.query]);


  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const removeFile = (path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  };

  const perm = permDef(status?.permissionMode ?? "reversible");
  const PermIcon = perm.Icon;

  const modelName = meta?.modelConfigName
    ? meta.modelConfigName.includes(":")
      ? meta.modelConfigName.split(":")[1]
      : meta.modelConfigName
    : "No model";

  const tokens = status?.lastInputTokens ?? 0;
  const budget = status?.contextBudget ?? 0;
  const pct = budget > 0 ? Math.round((tokens / budget) * 100) : 0;

  const placeholder = isRunning
    ? "Queue a follow-up…"
    : hasConversation
      ? "Reply…"
      : "Ask Fermi anything…";

  const canSend = Boolean(input.trim() || files.length > 0);

  return (
    <div className="input-area">
      {files.length > 0 && (
        <div className="file-tags">
          {files.map((f) => (
            <span key={f.path} className="file-tag">
              @{f.path}
              <button className="file-tag-remove" onClick={() => removeFile(f.path)} title="Remove">
                <IconX size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {fileQuery && fileResults.length > 0 && !showSlashPanel && (
        <div className="slash-panel">
          <div className="popup-title">Files</div>
          {fileResults.map((path, i) => (
            <div
              key={path}
              className={i === fileSel ? "slash-item selected" : "slash-item"}
              onClick={() => acceptFileSuggestion(path)}
              onMouseEnter={() => setFileSel(i)}
            >
              <span className="slash-name" style={{ fontFamily: "var(--f-mono)", fontWeight: 400 }}>{path}</span>
            </div>
          ))}
        </div>
      )}

      {showSlashPanel && (
        <CommandPanel
          filter={slashViaButton || panelInFlow ? "/" : input.trimStart()}
          onClose={closeSlash}
          onFlowStarted={handleFlowStarted}
          controllerRef={panelController}
        />
      )}

      <div className="input-box">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <div className="input-controls">
          <button className="ctrl-btn" onClick={() => rpcRequest("__ext.addFile")} title="Attach file">
            <IconPlus size={14} />
          </button>
          <button
            className={showSlashPanel ? "ctrl-btn active" : "ctrl-btn"}
            title="Commands"
            onClick={() => {
              if (showSlashPanel) {
                closeSlash();
              } else {
                setSlashViaButton(true);
                setShowSlashPanel(true);
              }
            }}
          >
            <IconSlash size={13} />
          </button>

          <div style={{ position: "relative" }} ref={permRef}>
            <button className={perm.pillClass} onClick={() => setPermOpen(!permOpen)} title={perm.desc}>
              <PermIcon size={12} />
              {perm.label}
            </button>
            {permOpen && (
              <div className="popup-menu" style={{ bottom: 32, left: 0 }}>
                <div className="popup-title">Permissions</div>
                {PERM_MODES.map((p) => {
                  const Ico = p.Icon;
                  const active = p.mode === perm.mode;
                  return (
                    <div
                      key={p.mode}
                      className="popup-item"
                      onClick={() => {
                        rpcRequest("session.setPermissionMode", { mode: p.mode });
                        setPermOpen(false);
                      }}
                    >
                      <span className="pi-icon"><Ico size={13} /></span>
                      <span className="pi-text">
                        <span className="pi-label">{p.label}</span>
                        <span className="pi-desc" style={{ display: "block" }}>{p.desc}</span>
                      </span>
                      {active && <span className="pi-check"><IconCheck size={12} /></span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ position: "relative", minWidth: 0 }} ref={modelRef}>
            <button className="model-select" onClick={() => setModelOpen(!modelOpen)} title="Switch model">
              <span className="model-name">{modelName}</span>
              <IconChevronDown size={10} />
            </button>
            {modelOpen && (
              <div className="popup-menu" style={{ bottom: 32, right: 0, maxHeight: 280, overflowY: "auto" }}>
                <div className="popup-title">Model</div>
                {models.length === 0 && (
                  <div className="popup-item" style={{ color: "var(--f-faint)", cursor: "default" }}>
                    No models configured
                  </div>
                )}
                {models.map((m) => {
                  const active = m.name === meta?.modelConfigName;
                  return (
                    <div
                      key={m.name}
                      className="popup-item"
                      onClick={() => {
                        rpcRequest("session.selectModel", { name: m.name });
                        setModelOpen(false);
                      }}
                    >
                      <span className="pi-text">
                        <span className="pi-label">{m.name}</span>
                        <span className="pi-desc" style={{ display: "block" }}>
                          {m.provider} · {Math.round(m.contextLength / 1024)}K
                        </span>
                      </span>
                      {active && <span className="pi-check"><IconCheck size={12} /></span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {budget > 0 && <ContextRing tokens={tokens} cached={status?.lastCacheReadTokens ?? 0} budget={budget} pct={pct} />}

          {isRunning ? (
            <button className="send-btn send-btn-stop" onClick={() => interruptTurn()} title="Stop (Esc)">
              <IconStop size={12} />
            </button>
          ) : (
            <button
              className={canSend ? "send-btn ready" : "send-btn"}
              onClick={handleSubmit}
              disabled={!canSend}
              title="Send (Enter)"
            >
              <IconArrowUp size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="context-chips">
        {workspaceInfo.workspaceName && (
          <span className="context-chip" title={meta?.workDir ?? undefined}>
            <IconFolder size={11} />
            {workspaceInfo.workspaceName}
          </span>
        )}
        {workspaceInfo.branch && (
          <span className="context-chip" title="Git branch">
            <IconBranch size={11} />
            {workspaceInfo.branch}
          </span>
        )}
        <span className="chips-right">
          {goal && (
            <span className="context-chip" title={`Goal: ${goal}`} style={{ color: "var(--f-accent)" }}>
              ◎ goal
            </span>
          )}
          {agentMode !== "default" && (
            <span className="context-chip" title={`Agent mode: ${agentMode} (change via /mode)`}>
              {agentMode}
            </span>
          )}
        </span>
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

  const r = 7;
  const stroke = 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * (Math.min(pct, 100) / 100);
  const color = pct > 80 ? "var(--f-error)" : pct > 55 ? "var(--f-warn)" : "var(--f-faint)";

  return (
    <div className="context-ring-wrap" ref={ref} title={`Context: ${pct}%`}>
      <svg width="20" height="20" viewBox="0 0 20 20" className="context-ring" onClick={() => setOpen(!open)}>
        <circle cx="10" cy="10" r={r} fill="none" stroke="var(--f-line)" strokeWidth={stroke} />
        <circle
          cx="10"
          cy="10"
          r={r}
          fill="none"
          stroke={color}
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
