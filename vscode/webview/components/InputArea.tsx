import React, { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "../store.js";
import { onEvent, rpcRequest } from "../vscode-api.js";
import { SlashCommandPanel, SLASH_COMMANDS, type SlashCommandDef } from "./SlashCommandPanel.js";

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
    // Send as regular input — server's session.turn handles it
    submitTurn(cmd.name);
    setInput("");
  }, [submitTurn]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && files.length === 0) return;

    // Check if it's a slash command with client action
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
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        if (showSlashPanel) {
          setShowSlashPanel(false);
        } else if (isRunning) {
          interruptTurn();
        }
      }
      if (e.key === "Tab" && showSlashPanel) {
        e.preventDefault();
      }
    },
    [handleSubmit, isRunning, interruptTurn, showSlashPanel],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // Show slash command panel when input starts with /
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

  const shortModel = meta?.modelConfigName
    ? (meta.modelConfigName.includes(":") ? meta.modelConfigName.split(":")[1] : meta.modelConfigName)
    : "—";

  const permMode = status?.permissionMode ?? "reversible";
  const permLabel = permMode === "yolo" ? "Full Access" : permMode === "read_only" ? "Read Only" : "Approve";

  return (
    <div className="input-area">
      {files.length > 0 && (
        <div className="file-tags">
          {files.map((f) => (
            <span key={f.path} className="file-tag">
              @{f.path}
              <span className="file-tag-remove" onClick={() => removeFile(f.path)}>
                ×
              </span>
            </span>
          ))}
        </div>
      )}

      {showSlashPanel && (
        <SlashCommandPanel
          filter={input.trimStart()}
          onSelect={handleSlashCommand}
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
        <div className="input-toolbar">
          <div className="input-toolbar-left">
            <button
              className="toolbar-btn"
              onClick={() => rpcRequest("__ext.addFile")}
              title="Attach file"
            >
              +
            </button>
            <button
              className="toolbar-btn toolbar-btn-perm"
              title="Permission mode"
            >
              🛡 {permLabel}
            </button>
          </div>
          <div className="input-toolbar-right">
            <button
              className="toolbar-btn"
              onClick={() => rpcRequest("__ext.selectModel")}
              title="Switch model"
            >
              {shortModel}
            </button>
            {isRunning ? (
              <button className="send-btn send-btn-stop" onClick={() => interruptTurn()} title="Stop">
                ■
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={handleSubmit}
                disabled={!input.trim() && files.length === 0}
                title="Send (Enter)"
              >
                ↑
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
