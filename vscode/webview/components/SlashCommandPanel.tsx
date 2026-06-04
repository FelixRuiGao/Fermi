import React, { useMemo } from "react";

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
  { name: "/summarize", description: "Manually summarize older context" },
  { name: "/permission", description: "Set permission mode" },
  { name: "/rewind", description: "Rewind to a previous turn" },
  { name: "/rename", description: "Rename current session" },
  { name: "/copy", description: "Copy the agent's most recent response" },
  { name: "/fork", description: "Fork session into a new branch" },
  { name: "/skills", description: "Manage installed skills" },
  { name: "/mcp", description: "Show MCP server status" },
  { name: "/hooks", description: "Show registered hooks" },
  { name: "/diff", description: "Set diff display (compact/full)" },
  { name: "/quit", description: "Exit the application" },
];

export function SlashCommandPanel({
  filter,
  onSelect,
}: {
  filter: string;
  onSelect: (cmd: SlashCommandDef) => void;
}) {
  const filtered = useMemo(() => {
    const prefix = filter.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) => cmd.name.startsWith(prefix) || cmd.name.startsWith("/" + prefix),
    );
  }, [filter]);

  if (filtered.length === 0) return null;

  return (
    <div className="slash-panel">
      {filtered.map((cmd) => (
        <div
          key={cmd.name}
          className="slash-item"
          onClick={() => onSelect(cmd)}
        >
          <span className="slash-name">{cmd.name}</span>
          <span className="slash-desc">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}
