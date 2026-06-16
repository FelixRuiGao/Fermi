---
title: "Tools Reference"
---

Fermi provides 13 built-in tools and 9 orchestration tools. Additional tools come from [Skills](/guide/skills) and [MCP servers](/guide/mcp).

## Built-in Tools (13)

### File Operations

| Tool | Description |
|------|-------------|
| `read_file` | Read a file's contents. Supports images (PNG, JPEG, GIF, WebP, BMP, SVG, ICO, TIFF) on multimodal models. |
| `write_file` | Write content to a file, creating it if it does not exist. |
| `edit_file` | Targeted find-and-replace edits. Supports `append_str` for appending. |
| `list_dir` | List directory contents. |
| `glob` | Find files matching a glob pattern (e.g., `**/*.ts`). |
| `grep` | Search file contents with regular expressions. |

### Shell

| Tool | Description |
|------|-------------|
| `bash` | Run a shell command with a required `timeout` (1–600 s). If the command doesn't finish in time it is **handed off to a background shell** (not killed) rather than truncated. 200KB output cap per stream. |
| `bash_background` | Run a shell command in the background. Returns a shell ID for tracking. |
| `bash_output` | Read output from a background shell process. |
| `kill_shell` | Kill a running background shell process. |

### Utility

| Tool | Description |
|------|-------------|
| `time` | Return the current local time, timezone, and UTC offset. |

### Web

| Tool | Description |
|------|-------------|
| `web_search` | Search the web. Uses provider-native search when available; client-side fallback returns numbered URL results with highlights and metadata where available. |
| `web_fetch` | Fetch and read the content of a URL. Uses Jina Reader first, then a local Readability/Turndown fallback for HTML pages, and returns readable page content. |

## Orchestration Tools (9)

### Context Management

| Tool | Description |
|------|-------------|
| `show_context` | Display the context distribution map. Shows all context groups with sizes and types. Activates inline annotations until dismissed. |
| `summarize_context` | Summarize groups of contiguous context IDs. Extracts valuable information and discards the rest. Operates at any granularity — from a single tool result to multiple turns. |

### Sub-Agent Management

| Tool | Description |
|------|-------------|
| `spawn` | Spawn a sub-agent with inline parameters. See [Sub-Agents](/guide/sub-agents). |
| `send` | Send a message to a persistent child agent. Delivered asynchronously. |
| `kill_agent` | Kill one or more running sub-agents by ID. |
| `check_status` | View sub-agent status and background shell status. |
| `await_event` | Pause until a runtime event arrives (sub-agent completion, messages, shell exit) or timeout expires. |

### User Interaction

| Tool | Description |
|------|-------------|
| `ask` | Ask the user 1–4 structured questions with 1–4 options each. Used when the agent needs a decision before proceeding. |

### Configuration

| Tool | Description |
|------|-------------|
| `reload` | Re-read skills, MCP servers, and the system prompt from disk and apply the difference. The agent calls this after editing a `SKILL.md`, `AGENTS.md`, or MCP config. Returns a summary of what changed. |

## Skills

When skills are enabled, a dynamic `skill` tool becomes available. It dispatches to the active skill's instructions. Manage skills with `/skills` or ask the agent to install new ones.

See [Skills](/guide/skills) for details.

## MCP Tools

MCP servers provide additional tools configured in `~/.fermi/mcp.json`. They appear alongside built-in tools automatically.

See [MCP Integration](/guide/mcp) for details.

## Tool Safety

Fermi does not sandbox tool execution. The `bash` tool runs commands directly, and file tools write to disk. Use the `/permission` command to control what is auto-allowed:

| Mode | Auto-allowed |
|------|-------------|
| `read_only` | Read & non-mutating tools (read_file, list_dir, glob, grep, web_fetch, web_search, show_context, summarize_context, ask, etc.) |
| `reversible` | Read tools + reversible writes (edit_file, write_file — overwrites included) |
| `yolo` | Everything except catastrophic operations |

The permission system uses tree-sitter to parse bash commands and classify them by risk level.

See [Permissions & Hooks](/guide/permissions) for details.
