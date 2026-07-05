import React, { useState } from "react";
import type { ConversationEntry } from "../../src/types.js";
import type { WorkItem } from "../model.js";
import { ToolCallEntry } from "./ToolCallEntry.js";
import { IconChevronRight, IconGear, IconAgent } from "./icons.js";

export type { WorkItem } from "../model.js";

function ThinkingItem({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setExpanded(!expanded)}>
        <IconChevronRight
          size={10}
          style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 120ms ease-out" }}
        />
        <span>Thinking</span>
      </div>
      {expanded && <div className="thinking-body">{text}</div>}
    </div>
  );
}

function StatusItem({ entry }: { entry: ConversationEntry }) {
  const isAgent = entry.kind === "sub_agent_rollup" || entry.kind === "sub_agent_done";
  return (
    <div className={entry.dim ? "status-line status-line-dim" : "status-line"}>
      {isAgent && <IconAgent size={11} style={{ verticalAlign: "-1px", marginRight: 5 }} />}
      {entry.text}
    </div>
  );
}

export function renderWorkItem(item: WorkItem, index: number, running: boolean): React.ReactNode {
  if (item.type === "tool") {
    return <ToolCallEntry key={item.view.key} view={item.view} running={running} />;
  }
  const entry = item.entry;
  const key = entry.id ?? `w-${index}`;
  if (entry.kind === "reasoning") {
    return <ThinkingItem key={key} text={entry.text} />;
  }
  if (!entry.text.trim()) return null;
  return <StatusItem key={key} entry={entry} />;
}

/**
 * A completed run of tool calls / reasoning between two prose messages.
 * Collapsed to one quiet line (Codex's「已处理」pattern); expandable.
 */
export function WorkGroup({ items }: { items: WorkItem[] }) {
  const [expanded, setExpanded] = useState(false);

  const toolCount = items.filter((i) => i.type === "tool").length;
  let elapsed = 0;
  for (const i of items) {
    if (i.type === "entry" && typeof i.entry.elapsedMs === "number") elapsed += i.entry.elapsedMs;
  }
  const label = toolCount > 0 ? `${toolCount} ${toolCount === 1 ? "step" : "steps"}` : "Thought";
  const time = elapsed >= 1000 ? ` · ${(elapsed / 1000).toFixed(0)}s` : "";

  return (
    <div className="work-group">
      <button
        className={expanded ? "work-group-header expanded" : "work-group-header"}
        onClick={() => setExpanded(!expanded)}
      >
        <IconChevronRight size={10} className="chevron" />
        <IconGear size={12} />
        <span>
          Worked{time} · {label}
        </span>
      </button>
      {expanded && (
        <div className="work-group-body">{items.map((item, i) => renderWorkItem(item, i, false))}</div>
      )}
    </div>
  );
}
