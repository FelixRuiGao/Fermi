import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { buildBlocks, isTurnEnd, type Block } from "../model.js";
import { WorkGroup, renderWorkItem } from "./WorkGroup.js";
import { Home } from "./Home.js";
import { InfoCards } from "./InfoCards.js";
import { Spinner } from "./Spinner.js";
import { IconArrowDown, IconCopy, IconCheck, IconWarning, IconChevronRight, IconAgent } from "./icons.js";
import { rpcRequest } from "../vscode-api.js";
import type { ConversationEntry } from "../../src/types.js";

// ---------------------------------------------------------------------------
// The server runs the canonical projection (capability "projectedLog"); this
// component groups the entry stream into prose blocks and collapsed work runs.
// Legacy raw-log rendering was removed — pre-Phase-3 binaries get an update
// prompt instead (the extension ships an auto-installer).
// ---------------------------------------------------------------------------

// ── Prose renderers ──

function UserMessage({ entry }: { entry: ConversationEntry }) {
  const text = entry.text;
  const isLong = text.length > 280 || text.split("\n").length >= 5;
  const cls = [
    "message message-user",
    isLong ? "message-user-long" : "",
    entry.queued ? "message-queued" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="bubble">{text}</div>
    </div>
  );
}

function AssistantMessage({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text || ""), [text]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="message message-assistant">
      <div className="content" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="msg-actions">
        <button className="msg-action-btn" onClick={handleCopy} title="Copy as markdown">
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
        </button>
      </div>
    </div>
  );
}

/** Nested read-only view of a child agent's projected log. */
function ChildTranscript({ childId }: { childId: string }) {
  const [entries, setEntries] = useState<ConversationEntry[] | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    rpcRequest<ConversationEntry[] | null>("session.getProjectedChildLog", { childId })
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setEntries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (entries === "loading") {
    return <div className="status-line status-line-dim">Loading transcript…</div>;
  }
  if (!entries || entries.length === 0) {
    return <div className="status-line status-line-dim">No transcript available.</div>;
  }
  const blocks = buildBlocks(entries);
  return (
    <>
      {blocks.map((block, i) => renderBlock(block, i, { liveWork: false, running: false }))}
    </>
  );
}

function AgentResultRow({ entry }: { entry: ConversationEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const full = entry.fullText && entry.fullText !== entry.text ? entry.fullText : null;
  const childId = typeof entry.meta?.agentId === "string" ? entry.meta.agentId : null;
  const expandable = Boolean(full || childId);
  return (
    <div className="agent-row">
      <div className="agent-row-header" onClick={expandable ? () => setExpanded(!expanded) : undefined}>
        <IconAgent size={12} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>
          {entry.text || "Agent complete"}
        </span>
        {expandable && (
          <IconChevronRight
            size={10}
            style={{ flexShrink: 0, transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 120ms ease-out" }}
          />
        )}
      </div>
      {expanded && (
        <div className="agent-row-body">
          {full && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{full}</div>}
          {childId && (
            <button
              className="work-group-header"
              style={{ marginTop: full ? 6 : 0 }}
              onClick={() => setShowTranscript(!showTranscript)}
            >
              <IconChevronRight
                size={10}
                className="chevron"
                style={{ transform: showTranscript ? "rotate(90deg)" : undefined }}
              />
              <span>Transcript</span>
            </button>
          )}
          {showTranscript && childId && <ChildTranscript childId={childId} />}
        </div>
      )}
    </div>
  );
}

function ErrorRow({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = text.split("\n")[0];
  const hasMore = text.length > firstLine.length || firstLine.length > 160;
  const shown = firstLine.length > 160 ? firstLine.slice(0, 160) + "…" : firstLine;
  return (
    <div className="error-row">
      <div
        className="error-row-header"
        onClick={hasMore ? () => setExpanded(!expanded) : undefined}
        style={hasMore ? { cursor: "pointer" } : undefined}
      >
        <span className="err-icon"><IconWarning size={13} /></span>
        <span>{shown}</span>
      </div>
      {expanded && <div className="error-row-detail">{text}</div>}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return <div className="transcript-divider">{label}</div>;
}

function TurnEndLine({ entry }: { entry: ConversationEntry }) {
  const turnEnd = entry.meta?.turnEndStatus as string;
  const ms = entry.meta?.elapsedMs;
  const elapsed = typeof ms === "number" && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : "";
  if (turnEnd === "interrupted") {
    return <div className="turn-end-line">interrupted{elapsed ? ` · ${elapsed}` : ""}</div>;
  }
  if (turnEnd === "error") {
    return <div className="turn-end-line" style={{ color: "var(--f-error)" }}>failed{elapsed ? ` · ${elapsed}` : ""}</div>;
  }
  if (!elapsed) return null;
  return <div className="turn-end-line">✓ {elapsed}</div>;
}

function renderBlock(block: Block, index: number, opts: { liveWork: boolean; running: boolean }) {
  if (block.type === "work") {
    if (opts.liveWork) {
      return (
        <div key={`live-${index}`} className="work-group">
          {block.items.map((item, i) => renderWorkItem(item, i, opts.running))}
        </div>
      );
    }
    const key = block.items[0]?.type === "tool"
      ? `wg-${(block.items[0] as { view: { key: string } }).view.key}`
      : `wg-${index}`;
    return <WorkGroup key={key} items={block.items} />;
  }

  const entry = block.entry;
  const key = entry.id ?? `b-${index}`;
  switch (entry.kind) {
    case "user":
      return <UserMessage key={key} entry={entry} />;
    case "assistant":
      return <AssistantMessage key={key} text={entry.text} />;
    case "agent_result":
      return <AgentResultRow key={key} entry={entry} />;
    case "error":
      return <ErrorRow key={key} text={entry.text} />;
    case "interrupted_marker":
      return <Divider key={key} label="Interrupted" />;
    case "compact_mark":
      return <Divider key={key} label={entry.text || "Context compacted"} />;
    case "status":
      if (isTurnEnd(entry)) return <TurnEndLine key={key} entry={entry} />;
      return (
        <div key={key} className={entry.dim ? "status-line status-line-dim" : "status-line"}>
          {entry.text}
        </div>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

function OutdatedBinaryView() {
  const [installing, setInstalling] = useState(false);
  return (
    <div className="state-view">
      <h2>Update Fermi</h2>
      <p>This version of the Fermi binary is too old for the editor UI. Update it to continue.</p>
      <button
        className="primary-btn"
        disabled={installing}
        onClick={async () => {
          setInstalling(true);
          try {
            await rpcRequest("__ext.installFermi");
          } finally {
            setInstalling(false);
          }
        }}
      >
        {installing ? "Updating…" : "Update Fermi"}
      </button>
    </div>
  );
}

export function Transcript() {
  const usingProjection = useStore((s) => s.meta?.capabilities?.includes("projectedLog") ?? false);
  const conversation = useStore((s) => s.conversation);
  const lastTurnError = useStore((s) => s.lastTurnError);
  const isRunning = useStore((s) => s.status?.currentTurnRunning ?? false);
  const isWaitingOnAsk = useStore((s) => s.pendingAsk !== null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const blocks = useMemo(() => buildBlocks(conversation), [conversation]);

  // The trailing work run renders live (expanded) while the turn works on it.
  const lastBlockIsWork = blocks.length > 0 && blocks[blocks.length - 1].type === "work";
  const liveWorkIndex = isRunning && lastBlockIsWork ? blocks.length - 1 : -1;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 120;
    setShowScrollBtn(distance > 300);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversation, isRunning]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // The error log entry is the primary surface; the banner covers turns whose
  // error never reached the log.
  const lastEntryIsError = useMemo(() => {
    for (let i = conversation.length - 1; i >= 0; i--) {
      const e = conversation[i];
      if (e.kind === "status" || e.kind === "progress") continue;
      return e.kind === "error";
    }
    return false;
  }, [conversation]);
  const showErrorBanner = Boolean(lastTurnError) && !lastEntryIsError;

  if (!usingProjection) {
    return (
      <div className="transcript-wrap">
        <OutdatedBinaryView />
      </div>
    );
  }

  const empty = blocks.length === 0 && !isRunning;

  return (
    <div className="transcript-wrap">
      <div className="transcript" ref={scrollRef} onScroll={handleScroll}>
        {empty ? (
          <>
            <Home />
            <InfoCards />
          </>
        ) : (
          <>
            {blocks.map((block, i) =>
              renderBlock(block, i, { liveWork: i === liveWorkIndex, running: isRunning }),
            )}
            {showErrorBanner && <ErrorRow text={lastTurnError!} />}
            <InfoCards />
            {isRunning && !lastBlockIsWork && <Spinner text="Working…" />}
            {!isRunning && isWaitingOnAsk && (
              <div className="status-line">Waiting for your approval…</div>
            )}
          </>
        )}
      </div>
      {showScrollBtn && !empty && (
        <button className="scroll-bottom-btn" onClick={scrollToBottom} title="Scroll to bottom">
          <IconArrowDown size={14} />
        </button>
      )}
    </div>
  );
}
