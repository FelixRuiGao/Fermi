---
title: "Slash Commands"
---

Slash commands are typed directly in the input during a session. They control context, models, permissions, and session lifecycle.

## Command Reference

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | | Show commands and shortcuts |
| `/model` | | Switch between configured models |
| `/key` | | Add, replace, remove, or import a provider API key |
| `/tier` | | Configure sub-agent model tiers (high/medium/low) |
| `/permission` | | Set permission mode (read_only / reversible / yolo) |
| `/summarize` | | Interactively summarize older context |
| `/summarize_hint` | | Configure the two-tier summarize hints (on/off, trigger levels) |
| `/compact` | | Full context reset with continuation summary |
| `/rewind` | `/undo` | Rewind to a previous turn (reverts conversation + files) |
| `/review` | | Review code changes (base branch / uncommitted / commit / custom) |
| `/session` | `/resume` | Resume a previous session |
| `/new` | | Start a new session |
| `/fork` | | Fork current session into a new branch |
| `/rename` | | Rename current session |
| `/shells` | | View and stop background shells |
| `/usage` | `/context` | Show this session's token usage |
| `/stat` | | Show all-time token statistics |
| `/autoupdate` | | Toggle background update checks |
| `/autocopy` | | Toggle copy-on-select (auto-copy a text selection) |
| `/skills` | | Enable/disable skills (checkbox picker) |
| `/mcp` | | Manage MCP servers and list tools |
| `/agents` | | Toggle the agents panel |
| `/todos` | | Toggle the todo panel |
| `/theme` | | Set theme mode (auto / light / dark) |
| `/diff` | | Set write/edit diff display (compact / full) |
| `/codex` | | OpenAI ChatGPT OAuth login |
| `/copilot` | | GitHub Copilot login |
| `/hooks` | | Manage registered hooks |
| `/copy` | | Copy the agent's most recent text response |
| `/raw` | `/md` | Toggle markdown raw/rendered mode |
| `/quit` | `/exit` | Exit the application |

Each enabled, user-invocable skill also appears as its own `/<skill-name>` command. Type `/` to see the full list — built-in commands and skills together.

## Context Commands

### `/summarize`

Opens an interactive range picker:

1. Select the **start** turn
2. Select the **end** turn
3. Optionally provide a **focus prompt** — instructions about what to preserve

The selected range is converted to context IDs and summarized. Key decisions and findings are preserved; the rest is discarded.

```text
/summarize
```

See [Context Management](/guide/context) for details.

### `/compact`

Full context reset with a continuation summary. Optionally provide instructions:

```text
/compact
/compact Preserve the DB schema decisions
```

After compact, the agent starts with a fresh context window containing only the continuation summary and AGENTS.md files.

### `/summarize_hint`

Configure the two automatic hints that nudge the agent to summarize as context fills up. Toggle them on/off, or set custom trigger percentages:

```text
/summarize_hint on
/summarize_hint off
/summarize_hint 50 75
```

The two integers are the Level 1 and Level 2 trigger percentages and must satisfy `0 < level1 < level2 < 85`. The setting persists. See [Context Management](/guide/context).

### `/rewind`

Roll back to a previous turn. Opens a picker showing turn history. Reverts both the conversation **and** file system changes made after that turn.

```text
/rewind
```

File revert uses tracked mutations (edits, writes, bash mkdir/cp/mv) with conflict detection — if a file was modified externally after the agent changed it, the rewind skips that file and reports the conflict.

### `/review`

Run a code review. Opens a picker to choose what to review:

```text
/review
```

- **Against a base branch** — review the diff vs. a base branch
- **Uncommitted changes** — review the current working-tree changes
- **A commit** — review a specific commit by SHA
- **Custom instructions** — provide your own review focus

You can also pass instructions inline: `/review check for SQL injection risks`. The picker supports adding extra instructions (Tab) to any option.

## Model Commands

### `/model`

Opens a hierarchical picker showing all configured providers and models. Select one to switch immediately.

For managed providers with missing API keys (Kimi, MiniMax, GLM, DeepSeek, Xiaomi, Qwen), selecting a model can prompt you to paste or import the key on the spot.

### `/key`

Manage a provider's API key directly — add, replace, remove, or import a detected external env var. Opens a picker of provider endpoints, then an action menu. Keys are stored in `~/.fermi/.env` (`0600`). This is the quickest way to rotate or fix a key without re-running `fermi init`.

### `/tier`

Configure which models sub-agents use at each tier level (high, medium, low). When the agent spawns a sub-agent with `model_level="low"`, it uses the model you assigned to the low tier.

## Permission & Safety

### `/permission`

Set the permission mode for tool execution:

| Mode | Behavior |
|------|----------|
| `read_only` | Only read tools auto-allowed; all writes require approval |
| `reversible` | Read + reversible writes auto-allowed |
| `yolo` | Everything auto-allowed except catastrophic operations |

### `/autoupdate`

Toggle background update checks:

```text
/autoupdate on
/autoupdate off
```

When enabled, Fermi checks GitHub Releases in the background, stages patch/minor updates automatically, and applies them on the next restart.

### `/hooks`

Show all registered hooks and their configuration. Hooks are shell commands that run in response to events (PreToolUse, PostToolUse, UserPromptSubmit, etc.).

## Session Commands

### `/session`

Resume a previous session. Shows a list of saved sessions with timestamps. Select one to restore its full conversation state.

```text
/session
/session <id>
```

### `/new`

Start a new session. The current session is auto-saved first.

### `/fork`

Fork the current session into a new branch — creates a copy of the current state that you can take in a different direction.

### `/rename`

Give the current session a descriptive name for easier identification in the session list.

## Other Commands

### `/skills`

Opens a checkbox picker to enable or disable installed skills. Skills are loaded from multiple roots — global (`~/.fermi/skills/`), project (`<project>/.fermi/skills/`), and the per-project store — and a toggle here reloads them immediately.

### `/mcp`

Connects configured MCP servers and lists discovered tools. Useful as a health check before starting work.

### `/agents`

Toggles the agents panel — the main agent and any running sub-agents with their status.

### `/todos`

Toggles the todo panel, which shows the agent's current plan/task list.

### `/theme`

Set the TUI theme mode: `auto`, `light`, or `dark`. Persisted to `settings.json` (`theme_mode`).

### `/diff`

Set how write/edit diffs are rendered: `compact` or `full`. Persisted to `settings.json` (`diff_display`).

### `/codex` / `/copilot`

OAuth login flows for OpenAI (ChatGPT) and GitHub Copilot respectively.

### `/copy`

Copy the agent's most recent text response to the system clipboard.

### `/raw`

Toggle between rendered markdown and raw markdown display. Also available as `/md`.

### `/shells`

View tracked background shells and stop them. Background shells come from `bash_background` or from a `bash` call that ran past its timeout and was handed off to the background.

### `/usage` and `/stat`

`/usage` (alias `/context`) shows the current session's token usage — how much of the context budget is consumed and the breakdown by category. `/stat` shows your all-time token statistics across every session.

### `/autocopy`

Toggle copy-on-select. When on, selecting text with the mouse automatically copies it to the clipboard (with a brief toast), so you don't need a separate copy step.

```text
/autocopy on
/autocopy off
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Send message |
| Option+Enter / Ctrl+N | Insert newline |
| ↑ / ↓ | Browse prompt history |
| Ctrl+Q | Cycle permission mode |
| Ctrl+V | Paste image |
| Ctrl+G | Toggle markdown raw view |
| PageUp / PageDown | Scroll half page |
| Opt+← / → | Switch between agent tabs |
| Ctrl+X | Kill all sub-agents |
| Ctrl+K | Kill all background shells |
| Alt+Backspace / Ctrl+W | Delete previous word |
| Cmd+Delete | Delete to line start (Ghostty/kitty protocol) |
| Ctrl+C | Cancel / Exit |
| @filename | Attach file |
