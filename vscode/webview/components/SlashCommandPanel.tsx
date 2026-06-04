import React, { useMemo, useState, useEffect, useRef } from "react";

export interface SlashCommandDef {
  name: string;
  description: string;
  clientAction?: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "/help", description: "Show commands and shortcuts" },
  { name: "/model", description: "Switch model", clientAction: "__ext.selectModel" },
  { name: "/compact", description: "Compact the active context", clientAction: "session.compact" },
  { name: "/new", description: "Start a new session", clientAction: "__ext.newSession" },
  { name: "/session", description: "Resume a previous session" },
  { name: "/summarize", description: "Summarize older context" },
  { name: "/permission", description: "Set permission mode" },
  { name: "/rewind", description: "Rewind to a previous turn" },
  { name: "/rename", description: "Rename current session" },
  { name: "/copy", description: "Copy last response" },
  { name: "/fork", description: "Fork session" },
  { name: "/skills", description: "Manage skills" },
  { name: "/mcp", description: "MCP server status" },
  { name: "/hooks", description: "Show hooks" },
  { name: "/diff", description: "Set diff display" },
  { name: "/quit", description: "Exit" },
];

export function SlashCommandPanel({
  filter,
  onSelect,
  onClose,
}: {
  filter: string;
  onSelect: (cmd: SlashCommandDef) => void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const prefix = filter.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) => cmd.name.startsWith(prefix) || cmd.name.startsWith("/" + prefix),
    );
  }, [filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="slash-panel" ref={listRef}>
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          className={`slash-item ${i === selectedIndex ? "slash-item-active" : ""}`}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="slash-name">{cmd.name}</span>
          <span className="slash-desc">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}
