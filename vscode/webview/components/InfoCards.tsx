import React from "react";
import { useStore, type InfoCard } from "../store.js";
import { buildCommands, COMMAND_GROUPS } from "../commands.js";
import { IconX, IconList, IconGlobe, IconGear, IconTerminal } from "./icons.js";

/**
 * Transient cards inserted into the transcript by info commands
 * (/help /usage /mcp /hooks /shells output). Local-only, dismissable,
 * never persisted.
 */

function CardShell({ card, title, icon, children }: {
  card: InfoCard;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const dismiss = useStore((s) => s.dismissInfoCard);
  return (
    <div className="info-card">
      <div className="info-card-title">
        {icon}
        <span style={{ flex: 1 }}>{title}</span>
        <button className="msg-action-btn" onClick={() => dismiss(card.id)} title="Dismiss">
          <IconX size={11} />
        </button>
      </div>
      {children}
    </div>
  );
}

function HelpCard({ card }: { card: InfoCard }) {
  const commands = buildCommands();
  return (
    <CardShell card={card} title="Commands" icon={<IconList size={13} />}>
      {COMMAND_GROUPS.map((group) => {
        const inGroup = commands.filter((c) => c.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: 6 }}>
            <div className="slash-group-label" style={{ padding: "2px 0" }}>{group}</div>
            <table>
              <tbody>
                {inGroup.map((c) => (
                  <tr key={c.name}>
                    <td style={{ fontFamily: "var(--f-mono)" }}>{c.name}</td>
                    <td>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="slash-group-label" style={{ padding: "2px 0" }}>Shortcuts</div>
      <table>
        <tbody>
          <tr><td>Enter</td><td>Send · Shift+Enter for newline</td></tr>
          <tr><td>Esc</td><td>Stop the current turn / dismiss panels</td></tr>
          <tr><td>Shift+Tab</td><td>Cycle permission mode</td></tr>
          <tr><td>/</td><td>Open the command panel</td></tr>
        </tbody>
      </table>
    </CardShell>
  );
}

function UsageCard({ card }: { card: InfoCard }) {
  const status = useStore((s) => s.status);
  const meta = useStore((s) => s.meta);
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const used = status?.lastInputTokens ?? 0;
  const budget = status?.contextBudget ?? 0;
  return (
    <CardShell card={card} title="Session usage" icon={<IconGear size={13} />}>
      <table>
        <tbody>
          <tr><td>Model</td><td>{meta?.modelConfigName ?? "—"}</td></tr>
          <tr><td>Context</td><td>{fmt(used)} / {fmt(budget)}{budget > 0 ? ` (${Math.round((used / budget) * 100)}%)` : ""}</td></tr>
          <tr><td>Cached</td><td>{fmt(status?.lastCacheReadTokens ?? 0)}</td></tr>
          <tr><td>Last turn total</td><td>{fmt(status?.lastTotalTokens ?? 0)}</td></tr>
          <tr><td>Turns</td><td>{meta?.turnCount ?? 0}</td></tr>
          <tr><td>Tool calls</td><td>{status?.lifetimeToolCallCount ?? 0}</td></tr>
        </tbody>
      </table>
    </CardShell>
  );
}

function McpCard({ card }: { card: Extract<InfoCard, { kind: "mcp" }> }) {
  const data = (card.data ?? {}) as {
    configured?: boolean;
    error?: string | null;
    toolCount?: number;
    servers?: Array<Record<string, unknown>>;
  };
  const servers = Array.isArray(data.servers) ? data.servers : [];
  return (
    <CardShell card={card} title="MCP servers" icon={<IconGlobe size={13} />}>
      {!data.configured && <div style={{ color: "var(--f-faint)" }}>No MCP servers configured.</div>}
      {data.error && <div style={{ color: "var(--f-error)" }}>{String(data.error)}</div>}
      {servers.length > 0 && (
        <table>
          <tbody>
            {servers.map((srv, i) => {
              const name = typeof srv.name === "string" ? srv.name : `server ${i + 1}`;
              const status = typeof srv.status === "string" ? srv.status
                : srv.connected === true ? "connected"
                  : srv.disabled === true ? "disabled" : "unknown";
              const tools = typeof srv.toolCount === "number" ? ` · ${srv.toolCount} tools` : "";
              return (
                <tr key={name}>
                  <td style={{ fontFamily: "var(--f-mono)" }}>{name}</td>
                  <td>{status}{tools}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data.configured && typeof data.toolCount === "number" && (
        <div style={{ color: "var(--f-faint)", marginTop: 4 }}>{data.toolCount} tools total</div>
      )}
    </CardShell>
  );
}

function HooksCard({ card }: { card: Extract<InfoCard, { kind: "hooks" }> }) {
  const data = (card.data ?? {}) as { available?: boolean; hooks?: Array<Record<string, unknown>> };
  const hooks = Array.isArray(data.hooks) ? data.hooks : [];
  return (
    <CardShell card={card} title="Hooks" icon={<IconGear size={13} />}>
      {(!data.available || hooks.length === 0) && (
        <div style={{ color: "var(--f-faint)" }}>No hooks configured.</div>
      )}
      {hooks.length > 0 && (
        <table>
          <tbody>
            {hooks.map((h, i) => {
              const name = typeof h.name === "string" ? h.name : typeof h.id === "string" ? h.id : `hook ${i + 1}`;
              const event = typeof h.event === "string" ? h.event : "";
              const disabled = h.disabled === true || h.enabled === false;
              return (
                <tr key={`${name}-${i}`}>
                  <td style={{ fontFamily: "var(--f-mono)" }}>{name}</td>
                  <td>{event}{disabled ? " · disabled" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </CardShell>
  );
}

function TextCard({ card }: { card: Extract<InfoCard, { kind: "text" }> }) {
  return (
    <CardShell card={card} title={card.title} icon={card.mono ? <IconTerminal size={13} /> : undefined}>
      <div
        style={
          card.mono
            ? {
                fontFamily: "var(--f-mono)",
                fontSize: "0.94em",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 260,
                overflowY: "auto",
                color: "var(--f-muted)",
              }
            : { whiteSpace: "pre-wrap", wordBreak: "break-word" }
        }
      >
        {card.body}
      </div>
    </CardShell>
  );
}

export function InfoCards() {
  const cards = useStore((s) => s.infoCards);
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => {
        switch (card.kind) {
          case "help":
            return <HelpCard key={card.id} card={card} />;
          case "usage":
            return <UsageCard key={card.id} card={card} />;
          case "mcp":
            return <McpCard key={card.id} card={card} />;
          case "hooks":
            return <HooksCard key={card.id} card={card} />;
          case "text":
            return <TextCard key={card.id} card={card} />;
          default:
            return null;
        }
      })}
    </>
  );
}
