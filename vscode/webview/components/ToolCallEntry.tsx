import React, { useState } from "react";
import type { ConversationEntry, LogEntry } from "../../src/types.js";

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

interface FileModifyData {
  path: string;
  added: number;
  removed: number;
}

/** Renderer-ready view of one tool call + its result. */
export interface ToolCallView {
  key: string;
  toolName: string;
  summary: string;
  fileModify: FileModifyData | null;
  resultText: string;
  isError: boolean;
}

function summarizeArgs(toolName: string, args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  if (toolName === "bash" && typeof args.command === "string") {
    return args.command.length > 80 ? args.command.slice(0, 80) + "..." : args.command;
  }
  if ((toolName === "read_file" || toolName === "write_file" || toolName === "edit_file") && typeof args.file_path === "string") {
    return args.file_path;
  }
  if (toolName === "web_search" && typeof args.query === "string") {
    return args.query;
  }
  return "";
}

/**
 * Real shape (src/diff-hunk.ts FileModifyDisplayData):
 * { filePath, language?, mode, totalLineCount, hunks: DiffHunk[], writeLines? }
 * with DiffHunk = { startLine, contextBefore, deletions, additions, contextAfter }.
 */
function normalizeFileModify(raw: unknown): FileModifyData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const filePath = typeof d.filePath === "string" ? d.filePath : "";
  if (!filePath) return null;
  let added = 0;
  let removed = 0;
  if (Array.isArray(d.hunks)) {
    for (const hunk of d.hunks) {
      const h = hunk as { additions?: unknown[]; deletions?: unknown[] } | null;
      added += Array.isArray(h?.additions) ? h.additions.length : 0;
      removed += Array.isArray(h?.deletions) ? h.deletions.length : 0;
    }
  }
  // write mode carries the whole file as writeLines instead of hunks.
  if (added === 0 && removed === 0 && Array.isArray(d.writeLines)) {
    added = d.writeLines.length;
  }
  return { path: filePath, added, removed };
}

/** Adapter: server-projected ConversationEntry pair → view. */
export function toolViewFromProjection(call: ConversationEntry, result?: ConversationEntry): ToolCallView {
  const meta = call.meta ?? {};
  const toolName = typeof meta.toolName === "string" ? meta.toolName : "tool";
  const args = (meta.toolArgs && typeof meta.toolArgs === "object")
    ? meta.toolArgs as Record<string, unknown>
    : undefined;
  const fileModify = normalizeFileModify(meta.fileModifyData ?? result?.meta?.fileModifyData);
  return {
    key: call.id ?? `${toolName}-${call.startedAt ?? 0}`,
    toolName,
    summary: summarizeArgs(toolName, args) || call.text,
    fileModify,
    resultText: result?.fullText ?? result?.text ?? "",
    isError: result?.meta?.isError === true,
  };
}

/** Adapter: raw LogEntry pair → view (legacy binaries without projectedLog). */
export function toolViewFromRawEntries(callEntry: LogEntry, resultEntry?: LogEntry): ToolCallView {
  const content = callEntry.content as { name?: string; arguments?: Record<string, unknown> } | undefined;
  const toolName = content?.name ?? "tool";
  return {
    key: callEntry.id,
    toolName,
    summary: summarizeArgs(toolName, content?.arguments),
    fileModify: normalizeFileModify(resultEntry?.meta?.fileModifyData),
    resultText: resultEntry?.display ?? "",
    isError: resultEntry?.meta?.isError === true,
  };
}

export function ToolCallEntry({ view }: { view: ToolCallView }) {
  const [expanded, setExpanded] = useState(false);
  const { toolName, summary, fileModify } = view;

  // No Diff button: fileModifyData carries hunks, not full before/after
  // texts, so a side-by-side diff cannot be reconstructed client-side yet.

  return (
    <div className="tool-call">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{expanded ? "▾" : "▸"}</span>
        <span className="tool-icon">{getToolIcon(toolName)}</span>
        <span className="tool-name">{toolName}</span>
        {view.isError && <span className="tool-error-pill">failed</span>}
        {fileModify ? (
          <span className="tool-file-pill">
            {fileModify.path.split(/[\\/]/).pop()}
            {fileModify.added > 0 && <span style={{ color: "var(--vscode-testing-iconPassed)" }}>+{fileModify.added}</span>}
            {fileModify.removed > 0 && <span style={{ color: "var(--vscode-testing-iconFailed)" }}>-{fileModify.removed}</span>}
          </span>
        ) : (
          <span className="tool-summary">{summary}</span>
        )}
      </div>
      {expanded && view.resultText && (
        <div className="tool-result">
          {view.resultText}
        </div>
      )}
    </div>
  );
}
