import React, { useEffect, useMemo, useRef } from "react";
import { useStore } from "../store.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { ToolCallEntry, toolViewFromProjection, toolViewFromRawEntries, type ToolCallView } from "./ToolCallEntry.js";
import { Spinner } from "./Spinner.js";
import type { ConversationEntry, LogEntry } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Primary path: server-projected ConversationEntry[] (capability "projectedLog").
// The server runs the canonical TUI projection; this component only renders.
// ---------------------------------------------------------------------------

type ProjectedItem =
  | { type: "entry"; entry: ConversationEntry }
  | { type: "tool"; view: ToolCallView };

function buildProjectedItems(entries: ConversationEntry[]): ProjectedItem[] {
  // The projection orders each tool_call directly before its tool_result,
  // matched via meta.toolCallId. Index results first to stay robust if that
  // adjacency ever loosens.
  const resultByCallId = new Map<string, ConversationEntry>();
  for (const e of entries) {
    if (e.kind !== "tool_result") continue;
    const callId = e.meta?.toolCallId;
    if (typeof callId === "string") resultByCallId.set(callId, e);
  }

  const items: ProjectedItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.kind === "tool_result") continue; // rendered with its call
    if (entry.kind === "tool_call") {
      const callId = entry.meta?.toolCallId;
      const result = typeof callId === "string"
        ? resultByCallId.get(callId)
        : (entries[i + 1]?.kind === "tool_result" ? entries[i + 1] : undefined);
      items.push({ type: "tool", view: toolViewFromProjection(entry, result) });
      continue;
    }
    items.push({ type: "entry", entry });
  }
  return items;
}

function UserMessage({ text, queued }: { text: string; queued?: boolean }) {
  return (
    <div className={queued ? "message message-user message-queued" : "message message-user"}>
      <div className="bubble">{text}</div>
    </div>
  );
}

function AssistantMessage({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text || ""), [text]);
  return (
    <div className="message message-assistant">
      <div className="content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function ThinkingMessage({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setExpanded(!expanded)}>
        <span>{expanded ? "▾" : "▸"}</span>
        <span>✦ Thinking</span>
      </div>
      {expanded && <div className="thinking-body">{text}</div>}
    </div>
  );
}

function AgentResultMessage({ text, fullText }: { text: string; fullText?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const expandable = Boolean(fullText && fullText !== text);
  return (
    <div className="agent-status" onClick={expandable ? () => setExpanded(!expanded) : undefined}>
      🔀 Agent complete: {expanded && fullText ? fullText : (text?.slice(0, 120) || "(no output)")}
      {expandable && !expanded && " …"}
    </div>
  );
}

function ErrorBlock({ text }: { text: string }) {
  return <div className="error-block">⚠ {text}</div>;
}

function StatusLine({ text, dim }: { text: string; dim?: boolean }) {
  return <div className={dim ? "agent-status agent-status-dim" : "agent-status"}>{text}</div>;
}

function Divider({ label }: { label: string }) {
  return <div className="transcript-divider">— {label} —</div>;
}

function renderProjectedItem(item: ProjectedItem, index: number) {
  if (item.type === "tool") {
    return <ToolCallEntry key={item.view.key} view={item.view} />;
  }
  const entry = item.entry;
  const key = entry.id ?? `ce-${index}`;
  switch (entry.kind) {
    case "user":
      return <UserMessage key={key} text={entry.text} queued={entry.queued} />;
    case "assistant":
      return <AssistantMessage key={key} text={entry.text} />;
    case "reasoning":
      return <ThinkingMessage key={key} text={entry.text} />;
    case "agent_result":
      return <AgentResultMessage key={key} text={entry.text} fullText={entry.fullText} />;
    case "error":
      return <ErrorBlock key={key} text={entry.text} />;
    case "interrupted_marker":
      return <Divider key={key} label="Interrupted" />;
    case "compact_mark":
      return <Divider key={key} label={entry.text || "Context compacted"} />;
    case "status": {
      // work_end/turn_end project as empty-text status entries carrying
      // turnEndStatus/elapsedMs in meta — render the turn summary instead of
      // a blank line.
      const turnEnd = entry.meta?.turnEndStatus;
      if (typeof turnEnd === "string") {
        const ms = entry.meta?.elapsedMs;
        const elapsed = typeof ms === "number" && ms > 0 ? ` · ${(ms / 1000).toFixed(1)}s` : "";
        const label = turnEnd === "interrupted"
          ? `⏹ Interrupted${elapsed}`
          : turnEnd === "error"
            ? `⚠ Turn ended with an error${elapsed}`
            : `✓ Done${elapsed}`;
        return <StatusLine key={key} text={label} dim />;
      }
      if (!entry.text.trim()) return null;
      return <StatusLine key={key} text={entry.text} dim={entry.dim} />;
    }
    case "progress":
    case "sub_agent_rollup":
    case "sub_agent_done":
      if (!entry.text.trim()) return null;
      return <StatusLine key={key} text={entry.text} dim={entry.dim} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Legacy path: raw LogEntry[] + webview-side pairing, for binaries without
// the projectedLog capability. Delete when a minimum binary version with
// Phase-3 protocol can be assumed.
// ---------------------------------------------------------------------------

interface PairedToolCall {
  call: LogEntry;
  result?: LogEntry;
}

function buildLegacyItems(entries: LogEntry[]): Array<LogEntry | PairedToolCall> {
  const visible = entries.filter((e) => !e.discarded && e.tuiVisible !== false);
  const resultByCallId = new Map<string, LogEntry>();

  for (const e of visible) {
    if (e.type === "tool_result") {
      const callId = e.meta?.toolCallId as string | undefined;
      if (callId) resultByCallId.set(callId, e);
    }
  }

  const items: Array<LogEntry | PairedToolCall> = [];
  for (const entry of visible) {
    if (entry.type === "tool_result") continue;
    if (entry.type === "tool_call") {
      const callContent = entry.content as { id?: string } | undefined;
      const callId = callContent?.id;
      const result = callId ? resultByCallId.get(callId) : undefined;
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

function renderLegacyItem(item: LogEntry | PairedToolCall, index: number) {
  if (isPaired(item)) {
    const view = toolViewFromRawEntries(item.call, item.result);
    return <ToolCallEntry key={view.key} view={view} />;
  }
  const entry = item;
  switch (entry.type) {
    case "user_message":
      return <UserMessage key={entry.id} text={entry.display} />;
    case "assistant_text":
      return <AssistantMessage key={entry.id} text={entry.display} />;
    case "reasoning":
      return <ThinkingMessage key={entry.id} text={entry.display} />;
    case "agent_result":
      return <AgentResultMessage key={entry.id} text={entry.display} />;
    case "error":
      return <ErrorBlock key={entry.id} text={entry.display} />;
    case "sub_agent_start":
    case "sub_agent_end":
    case "status":
      return <StatusLine key={entry.id} text={entry.display} />;
    default:
      if (entry.displayKind === "assistant") {
        return <AssistantMessage key={entry.id} text={entry.display} />;
      }
      return null;
  }
}

// ---------------------------------------------------------------------------

export function Transcript() {
  const usingProjection = useStore((s) => s.meta?.capabilities?.includes("projectedLog") ?? false);
  const conversation = useStore((s) => s.conversation);
  const logEntries = useStore((s) => s.logEntries);
  const lastTurnError = useStore((s) => s.lastTurnError);
  const isRunning = useStore((s) => s.status?.currentTurnRunning ?? false);
  const isWaitingOnAsk = useStore((s) => s.pendingAsk !== null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const projectedItems = useMemo(
    () => (usingProjection ? buildProjectedItems(conversation) : []),
    [usingProjection, conversation],
  );
  const legacyItems = useMemo(
    () => (usingProjection ? [] : buildLegacyItems(logEntries)),
    [usingProjection, logEntries],
  );
  const itemCount = usingProjection ? projectedItems.length : legacyItems.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [itemCount, isRunning]);

  // The error log entry is the primary surface; the banner covers turns whose
  // error never reached the log (legacy binaries). Skip trailing bookkeeping
  // entries (work_end projects as a status entry AFTER the error entry) when
  // checking whether the log already shows this failure.
  const lastEntryIsError = useMemo(() => {
    if (usingProjection) {
      for (let i = conversation.length - 1; i >= 0; i--) {
        const e = conversation[i];
        if (e.kind === "status" || e.kind === "progress") continue;
        return e.kind === "error";
      }
      return false;
    }
    for (let i = logEntries.length - 1; i >= 0; i--) {
      const e = logEntries[i];
      if (e.type === "status" || e.type === "work_end" || e.type === "turn_end" || e.type === "token_update") continue;
      return e.type === "error";
    }
    return false;
  }, [usingProjection, conversation, logEntries]);
  const showErrorBanner = Boolean(lastTurnError) && !lastEntryIsError;

  return (
    <div className="transcript" ref={scrollRef}>
      {itemCount === 0 && !isRunning && (
        <div className="welcome">
          <h2>Fermi</h2>
          <p>Ask a question or describe a task to get started.</p>
        </div>
      )}
      {usingProjection
        ? projectedItems.map((item, i) => renderProjectedItem(item, i))
        : legacyItems.map((item, i) => renderLegacyItem(item, i))}
      {showErrorBanner && <ErrorBlock text={lastTurnError!} />}
      {isRunning && <Spinner text="Working..." />}
      {!isRunning && isWaitingOnAsk && <StatusLine text="⏸ Waiting for your approval…" />}
    </div>
  );
}
