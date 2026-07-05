import React, { useEffect, useState } from "react";
import { useStore } from "../store.js";
import { rpcRequest } from "../vscode-api.js";
import { childStatusView, isLiveChild, liveActivitySummary } from "../model.js";
import { ChildTranscript } from "./Transcript.js";
import { IconAgent, IconChevronRight, IconStop, IconTerminal } from "./icons.js";
import type { ChildSessionSnapshot, ShellSnapshot } from "../../src/types.js";

/**
 * Persistent live-activity strip pinned above the composer: one row per
 * running sub-agent and background shell, updating from the server's
 * child.changed / shells.changed pushes. Replaces the old click-to-spawn
 * "Agents" info cards (which stacked one card per click and survived /new).
 * Disappears on its own when nothing is running.
 */

function AgentRow({ child }: { child: ChildSessionSnapshot }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const v = childStatusView(child);
  return (
    <div className="activity-item">
      <div className="activity-row" onClick={() => setShowTranscript(!showTranscript)}>
        <span className="activity-icon"><IconAgent size={12} /></span>
        <span className="activity-label">{v.label}</span>
        <span className={v.needsApproval ? "activity-phase needs-approval" : "activity-phase shimmer-text"}>
          {v.phase}
        </span>
        {v.toolCount > 0 && <span className="activity-meta">{v.toolCount} tools</span>}
        <span className="activity-detail" title={v.detail}>{v.detail}</span>
        <IconChevronRight
          size={10}
          className="activity-chevron"
          style={showTranscript ? { transform: "rotate(90deg)" } : undefined}
        />
      </div>
      {showTranscript && (
        <div className="activity-body">
          <ChildTranscript childId={child.id} revision={child.logRevision} />
        </div>
      )}
    </div>
  );
}

function ShellRow({ shell }: { shell: ShellSnapshot }) {
  const [showOutput, setShowOutput] = useState(false);
  const [tail, setTail] = useState<string | null>(null);

  useEffect(() => {
    if (!showOutput) return;
    let cancelled = false;
    const fetchTail = () => {
      rpcRequest<{ logTail: string; logTruncated: boolean }>(
        "session.getBackgroundShellDetail",
        { id: shell.id, maxChars: 4000 },
      )
        .then((d) => {
          if (!cancelled) setTail((d.logTruncated ? "…\n" : "") + (d.logTail || "(no output yet)"));
        })
        .catch(() => {
          if (!cancelled) setTail("(output unavailable)");
        });
    };
    fetchTail();
    // shells.changed only fires on status flips, so poll while expanded.
    const timer = setInterval(fetchTail, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showOutput, shell.id]);

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    void rpcRequest("session.stopBackgroundShell", { id: shell.id }).catch(() => {});
  };

  return (
    <div className="activity-item">
      <div className="activity-row" onClick={() => setShowOutput(!showOutput)}>
        <span className="activity-icon"><IconTerminal size={12} /></span>
        <span className="activity-detail activity-cmd" title={shell.command}>{shell.command}</span>
        <span className="activity-meta">{Math.round(shell.elapsedSeconds)}s</span>
        <button className="activity-stop" onClick={stop} title="Stop shell">
          <IconStop size={10} />
        </button>
        <IconChevronRight
          size={10}
          className="activity-chevron"
          style={showOutput ? { transform: "rotate(90deg)" } : undefined}
        />
      </div>
      {showOutput && <pre className="activity-output">{tail ?? "Loading…"}</pre>}
    </div>
  );
}

export function LiveActivity() {
  const children = useStore((s) => s.children);
  const shells = useStore((s) => s.shells);
  const [collapsed, setCollapsed] = useState(false);

  const liveAgents = children.filter(isLiveChild);
  const liveShells = shells.filter((sh) => sh.status === "running");
  if (liveAgents.length === 0 && liveShells.length === 0) return null;

  return (
    <div className="live-activity">
      <button className="activity-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="activity-pulse" />
        <span>{liveActivitySummary(liveAgents.length, liveShells.length)}</span>
        {collapsed && liveAgents.length > 0 && (
          <span className="activity-detail">
            {childStatusView(liveAgents[liveAgents.length - 1]).detail}
          </span>
        )}
        <IconChevronRight
          size={10}
          className="activity-chevron"
          style={collapsed ? undefined : { transform: "rotate(90deg)" }}
        />
      </button>
      {!collapsed && (
        <div className="activity-list">
          {liveAgents.map((c) => <AgentRow key={c.id} child={c} />)}
          {liveShells.map((sh) => <ShellRow key={sh.id} shell={sh} />)}
        </div>
      )}
    </div>
  );
}
