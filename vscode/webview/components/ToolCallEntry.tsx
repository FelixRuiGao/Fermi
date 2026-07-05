import React, { useState } from "react";
import { diffStats, type ToolCallView } from "../model.js";
import { toolIcon, IconChevronRight, IconFile } from "./icons.js";
import { DiffView, openFile } from "./DiffView.js";

export type { ToolCallView } from "../model.js";

export function ToolCallEntry({ view, running }: { view: ToolCallView; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { toolName, summary, filePath, fileModify } = view;
  const Icon = toolIcon(toolName);
  const isLive = view.pending && running;
  const fileName = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : null;
  const stats = fileModify ? diffStats(fileModify) : null;
  const expandable = Boolean(fileModify || view.resultText);

  return (
    <div className={isLive ? "tool-row tool-row-running" : "tool-row"}>
      <div
        className="tool-row-header"
        onClick={expandable ? () => setExpanded(!expanded) : undefined}
        style={expandable ? undefined : { cursor: "default" }}
      >
        <span className="tool-row-icon"><Icon size={13} /></span>
        <span className="tool-row-name">{toolName}</span>
        {view.isError && <span className="tool-error-pill">failed</span>}
        {fileName ? (
          <span
            className="file-chip"
            title={filePath ?? undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (filePath) openFile(filePath, fileModify?.hunks[0]?.startLine);
            }}
          >
            <IconFile size={11} />
            <span className="chip-name">{fileName}</span>
            {stats && stats.added > 0 && <span className="chip-add">+{stats.added}</span>}
            {stats && stats.removed > 0 && <span className="chip-del">−{stats.removed}</span>}
          </span>
        ) : (
          <span className="tool-row-summary">{summary}</span>
        )}
        {expandable && (
          <span
            className="tool-row-icon"
            style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 120ms ease-out" }}
          >
            <IconChevronRight size={11} />
          </span>
        )}
      </div>
      {expanded && (
        <div className="tool-row-body">
          {fileModify ? (
            <DiffView data={fileModify} />
          ) : view.resultText ? (
            <div className="tool-result-text">{view.resultText}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
