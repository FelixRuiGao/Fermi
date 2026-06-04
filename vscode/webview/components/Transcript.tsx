import React, { useEffect, useMemo, useRef } from "react";
import { useStore } from "../store.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { ToolCallEntry } from "./ToolCallEntry.js";
import { Spinner } from "./Spinner.js";
import type { LogEntry } from "../../src/types.js";

interface PairedToolCall {
  call: LogEntry;
  result?: LogEntry;
}

function buildItems(entries: LogEntry[]): Array<LogEntry | PairedToolCall> {
  const visible = entries.filter((e) => !e.discarded && e.tuiVisible !== false);
  const resultByCallId = new Map<string, LogEntry>();

  for (const e of visible) {
    if (e.type === "tool_result") {
      const callId = e.meta?.toolCallId as string | undefined;
      if (callId) resultByCallId.set(callId, e);
    }
  }

  const items: Array<LogEntry | PairedToolCall> = [];
  const consumedResults = new Set<string>();

  for (const entry of visible) {
    if (entry.type === "tool_result") continue;

    if (entry.type === "tool_call") {
      const callContent = entry.content as { id?: string } | undefined;
      const callId = callContent?.id;
      const result = callId ? resultByCallId.get(callId) : undefined;
      if (result) consumedResults.add(result.id);
      items.push({ call: entry, result });
      continue;
    }

    items.push(entry);
  }

  return items;
}

function isPaired(item: LogEntry | PairedToolCall): item is PairedToolCall {
  return "call" in item;
}

function UserMessage({ entry }: { entry: LogEntry }) {
  return (
    <div className="message message-user">
      <div className="bubble">{entry.display}</div>
    </div>
  );
}

function AssistantMessage({ entry }: { entry: LogEntry }) {
  const html = useMemo(() => renderMarkdown(entry.display || ""), [entry.display]);
  return (
    <div className="message message-assistant">
      <div className="content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function ThinkingMessage({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = React.useState(false);
  const duration = entry.meta?.thinkingDurationMs as number | undefined;
  const label = duration ? `Thought for ${(duration / 1000).toFixed(1)}s` : "Thinking...";

  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setExpanded(!expanded)}>
        <span>{expanded ? "▾" : "▸"}</span>
        <span>✦ {label}</span>
      </div>
      {expanded && <div className="thinking-body">{entry.display}</div>}
    </div>
  );
}

function AgentResultMessage({ entry }: { entry: LogEntry }) {
  return (
    <div className="agent-status">
      🔀 Agent complete: {entry.display?.slice(0, 120) || "(no output)"}
    </div>
  );
}

function ErrorMessage({ entry }: { entry: LogEntry }) {
  return <div className="error-block">⚠ {entry.display}</div>;
}

function StatusMessage({ entry }: { entry: LogEntry }) {
  return <div className="agent-status">{entry.display}</div>;
}

function renderItem(item: LogEntry | PairedToolCall, index: number) {
  if (isPaired(item)) {
    return <ToolCallEntry key={item.call.id} callEntry={item.call} resultEntry={item.result} />;
  }

  const entry = item;
  switch (entry.type) {
    case "user_message":
      return <UserMessage key={entry.id} entry={entry} />;
    case "assistant_text":
      return <AssistantMessage key={entry.id} entry={entry} />;
    case "reasoning":
      return <ThinkingMessage key={entry.id} entry={entry} />;
    case "agent_result":
      return <AgentResultMessage key={entry.id} entry={entry} />;
    case "error":
      return <ErrorMessage key={entry.id} entry={entry} />;
    case "sub_agent_start":
    case "sub_agent_end":
    case "status":
      return <StatusMessage key={entry.id} entry={entry} />;
    default:
      if (entry.displayKind === "assistant") {
        return <AssistantMessage key={entry.id} entry={entry} />;
      }
      return null;
  }
}

export function Transcript() {
  const logEntries = useStore((s) => s.logEntries);
  const isRunning = useStore((s) => s.status?.currentTurnRunning ?? false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => buildItems(logEntries), [logEntries]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items.length, isRunning]);

  return (
    <div className="transcript" ref={scrollRef}>
      {items.length === 0 && !isRunning && (
        <div className="welcome">
          <h2>Fermi</h2>
          <p>Ask a question or describe a task to get started.</p>
        </div>
      )}
      {items.map((item, i) => renderItem(item, i))}
      {isRunning && <Spinner text="Working..." />}
    </div>
  );
}
