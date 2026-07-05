import React from "react";
import { rpcRequest } from "../vscode-api.js";
import { diffStats, type FileModifyDisplay } from "../model.js";
import { IconFile } from "./icons.js";

export function openFile(path: string, line?: number): void {
  void rpcRequest("__ext.openFile", { path, line });
}

function DiffLine({ kind, num, text }: { kind: "ctx" | "add" | "del"; num: number | null; text: string }) {
  const cls = kind === "add" ? "diff-line diff-add" : kind === "del" ? "diff-line diff-del" : "diff-line";
  return (
    <div className={cls}>
      <span className="diff-gutter">{num ?? ""}</span>
      <span className="diff-text">{text.length > 0 ? text : " "}</span>
    </div>
  );
}

/**
 * Inline unified diff rendered straight from the hunk data the server
 * already ships — no client-side diffing. Write mode shows the new file
 * content as additions (truncated).
 */
export function DiffView({ data }: { data: FileModifyDisplay }) {
  const fileName = data.filePath.split(/[\\/]/).pop() ?? data.filePath;
  const { added, removed } = diffStats(data);

  const rows: React.ReactNode[] = [];
  if (data.mode === "write" && data.writeLines && data.hunks.length === 0) {
    const lines = data.writeLines.slice(0, 120);
    lines.forEach((text, i) => {
      rows.push(<DiffLine key={`w${i}`} kind="add" num={i + 1} text={text} />);
    });
    if (data.writeLines.length > lines.length) {
      rows.push(
        <div key="wmore" className="diff-line">
          <span className="diff-gutter" />
          <span className="diff-text" style={{ color: "var(--f-faint)" }}>
            … {data.writeLines.length - lines.length} more lines
          </span>
        </div>,
      );
    }
  } else {
    data.hunks.forEach((h, hi) => {
      if (hi > 0) rows.push(<div key={`sep${hi}`} className="diff-hunk-sep" />);
      let oldLine = h.startLine - h.contextBefore.length;
      let newLine = oldLine;
      for (const [i, text] of h.contextBefore.entries()) {
        rows.push(<DiffLine key={`h${hi}cb${i}`} kind="ctx" num={newLine} text={text} />);
        oldLine++;
        newLine++;
      }
      for (const [i, text] of h.deletions.entries()) {
        rows.push(<DiffLine key={`h${hi}d${i}`} kind="del" num={oldLine} text={text} />);
        oldLine++;
      }
      for (const [i, text] of h.additions.entries()) {
        rows.push(<DiffLine key={`h${hi}a${i}`} kind="add" num={newLine} text={text} />);
        newLine++;
      }
      for (const [i, text] of h.contextAfter.entries()) {
        rows.push(<DiffLine key={`h${hi}ca${i}`} kind="ctx" num={newLine} text={text} />);
        oldLine++;
        newLine++;
      }
    });
  }

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span
          className="file-chip"
          onClick={() => openFile(data.filePath, data.hunks[0]?.startLine)}
          title={data.filePath}
        >
          <IconFile size={12} />
          <span className="chip-name">{fileName}</span>
        </span>
        {added > 0 && <span style={{ color: "var(--f-ok)" }}>+{added}</span>}
        {removed > 0 && <span style={{ color: "var(--f-error)" }}>−{removed}</span>}
      </div>
      <div className="diff-body">{rows}</div>
    </div>
  );
}
