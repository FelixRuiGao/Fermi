import React, { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "../store.js";
import { onEvent } from "../vscode-api.js";

export function InputArea() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Array<{ path: string; selection?: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submitTurn = useStore((s) => s.submitTurn);
  const isRunning = useStore((s) => s.status?.currentTurnRunning ?? false);
  const interruptTurn = useStore((s) => s.interruptTurn);

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
  }, [input, files, submitTurn]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape" && isRunning) {
        interruptTurn();
      }
    },
    [handleSubmit, isRunning, interruptTurn],
  );

  const removeFile = (path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  };

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
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isRunning ? "Thinking... (Esc to interrupt)" : "Ask Fermi... (Ctrl+Enter to send)"}
        disabled={false}
        rows={3}
      />
      <div className="input-controls">
        <span className="input-hint">
          {isRunning ? "Esc to interrupt" : "Ctrl+Enter to send"}
        </span>
        {isRunning ? (
          <button className="btn-deny" onClick={() => interruptTurn()}>
            Stop
          </button>
        ) : (
          <button className="btn-approve" onClick={handleSubmit} disabled={!input.trim() && files.length === 0}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
