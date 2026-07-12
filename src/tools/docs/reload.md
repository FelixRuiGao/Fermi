<!-- brief -->
Reload skills, MCP servers, and the system prompt from disk. Call after writing or editing SKILL.md files or AGENTS.md. Returns a summary of what changed. New or changed MCP servers are NOT started by reload — the user connects them with /mcp.

<!-- guide -->
Reload skills, MCP servers, and the system prompt from disk. Call after writing or editing:
- `SKILL.md` files (install/update/remove skills)
- `AGENTS.md` (persistent memory)

You can batch multiple writes then call reload once. Returns a summary of what changed.

**MCP servers:** reload re-reads MCP configuration and applies removals, but it does NOT start servers that are new or whose command changed — starting a server spawns a process on the user's machine, so that stays a user action. The report lists any skipped servers; tell the user to run `/mcp` to connect them (or `/trust` if the config ships with the repository). Editing `settings.json` yourself and calling reload will therefore not bring a server online.

Skill and MCP tool availability can change during a session when the user enables, disables, connects, disconnects, or reloads them. If a skill or MCP tool appears or disappears compared with earlier turns, treat that as normal runtime configuration behavior. Do not infer from the availability change alone that your earlier answer or reasoning was wrong; use the tools currently available in this turn.
