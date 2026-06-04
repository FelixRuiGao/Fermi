import React, { useState } from "react";
import { rpcRequest } from "../vscode-api.js";
import type { LogEntry } from "../../src/types.js";

const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read_file: "📄",
  write_file: "✎",
  edit_file: "✎",
  list_directory: "📁",
  search_files: "🔍",
  web_search: "🌐",
  web_fetch: "🌐",
  spawn: "🔀",
  ask_user: "❓",
};

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] ?? "⚙";
}

function getToolSummary(entry: LogEntry): string {
  const content = entry.content as { name?: string; arguments?: Record<string, unknown> } | undefined;
  if (!content?.arguments) return "";

  const args = content.arguments;
  if (content.name === "bash" && typeof args.command === "string") {
    return args.command.length > 80 ? args.command.slice(0, 80) + "..." : args.command;
  }
  if ((content.name === "read_file" || content.name === "write_file" || content.name === "edit_file") && typeof args.file_path === "string") {
    return args.file_path;
  }
  if (content.name === "web_search" && typeof args.query === "string") {
    return args.query;
  }
  return "";
}

function isFileModify(entry: LogEntry): boolean {
  const content = entry.content as { name?: string } | undefined;
  return content?.name === "write_file" || content?.name === "edit_file";
}

function getFileModifyData(result: LogEntry): { path: string; before: string; after: string; added: number; removed: number } | null {
  const meta = result.meta;
  if (meta?.fileModifyData) {
    const d = meta.fileModifyData as any;
    return {
      path: d.path ?? "",
      before: d.before ?? "",
      after: d.after ?? "",
      added: d.linesAdded ?? 0,
      removed: d.linesRemoved ?? 0,
    };
  }
  return null;
}

export function ToolCallEntry({
  callEntry,
  resultEntry,
}: {
  callEntry: LogEntry;
  resultEntry?: LogEntry;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = callEntry.content as { name?: string; arguments?: Record<string, unknown> } | undefined;
  const toolName = content?.name ?? "tool";
  const summary = getToolSummary(callEntry);
  const fileModify = resultEntry ? getFileModifyData(resultEntry) : null;

  const handleShowDiff = async () => {
    if (!fileModify) return;
    await rpcRequest("vscode.showDiff", {
      filePath: fileModify.path,
      before: fileModify.before,
      after: fileModify.after,
    });
  };

  return (
    <div className="tool-call">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{expanded ? "▾" : "▸"}</span>
        <span className="tool-icon">{getToolIcon(toolName)}</span>
        <span className="tool-name">{toolName}</span>
        {fileModify ? (
          <span className="tool-file-pill">
            {fileModify.path.split("/").pop()}
            {fileModify.added > 0 && <span style={{ color: "var(--vscode-testing-iconPassed)" }}>+{fileModify.added}</span>}
            {fileModify.removed > 0 && <span style={{ color: "var(--vscode-testing-iconFailed)" }}>-{fileModify.removed}</span>}
          </span>
        ) : (
          <span className="tool-summary">{summary}</span>
        )}
        {fileModify && (
          <button className="tool-diff-btn" onClick={(e) => { e.stopPropagation(); handleShowDiff(); }}>
            Diff
          </button>
        )}
      </div>
      {expanded && resultEntry && (
        <div className="tool-result">
          {resultEntry.display || "(no output)"}
        </div>
      )}
    </div>
  );
}
