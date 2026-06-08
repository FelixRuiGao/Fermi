---
title: "Configuration"
---

Fermi loads bundled defaults from the installed package and user overrides from `~/.fermi/`. Run `fermi init` to create the initial configuration.

## Directory Structure

```text
~/.fermi/
├── settings.json          # User settings (JSONC) — context budget, permissions, model pins, etc.
├── .env                   # API keys and managed provider slots (0600 permissions)
├── mcp.json               # MCP server configurations (optional, user-edited)
├── permissions.json       # Global permission rules (auto-managed)
├── AGENTS.md              # Global persistent memory
├── state/                 # Auto-managed runtime state
│   ├── oauth.json         #   OAuth tokens (ChatGPT + GitHub Copilot)
│   └── model-selection.json  #   Saved provider / model / thinking-level selection
├── projects/              # Per-project managed store, keyed by path hash
│   └── <name>_<hash>/.fermi/   #   project permissions, hooks, skills, templates
├── agent_templates/       # User-added agent templates
├── hooks/                 # User hooks (global)
├── skills/                # User skills
└── prompts/               # User prompt overrides
```

## settings.json

User-editable settings file (JSONC format). Created manually or via `-c` overrides. Supports global (`~/.fermi/settings.json`) and project-local (`<project>/.fermi/settings.json`) — local overrides global.

```jsonc
{
  "context_budget_percent": 80,
  "permission_mode": "reversible",
  "default_model": "anthropic:claude-opus-4-6",
  "thinking_level": "high"
}
```

| Setting | Type | Description |
|---------|------|-------------|
| `context_budget_percent` | number (1–100) | Effective context as percentage of model max. Default: 100. |
| `permission_mode` | string | Default mode: `read_only`, `reversible`, or `yolo`. |
| `default_model` | string | Declarative default model (overrides init-wizard selection). |
| `thinking_level` | string | Default thinking level for the main agent. |
| `model_tiers` | object | Sub-agent tiers: `{ high: {...}, medium: {...}, low: {...} }`. |
| `sub_agent_inherit_mcp` | boolean | Sub-agents inherit MCP servers. Default: true. |
| `sub_agent_inherit_hooks` | boolean | Sub-agents inherit hooks. Default: true. |
| `disabled_skills` | string[] | Skills disabled by default. |
| `accent_color` | string | Hex color for TUI accent. |
| `mcp_servers` | object | MCP servers (alternative to mcp.json, supports local overrides). |
| `auto_update` | boolean \| `"notify"` | Background update checks against GitHub Releases. `true`: patch/minor auto-stage, major notify only. `"notify"`: notify only. `false`: disable checks. Toggle via `/autoupdate` or edit settings directly. |
| `theme_mode` | string | TUI theme: `auto`, `light`, or `dark`. Default: `auto`. Set via `/theme`. |
| `diff_display` | string | Write/edit diff rendering: `compact` or `full`. Default: `compact`. Set via `/diff`. |
| `agent_models` | object | Per-template model pins for sub-agents. |
| `providers` | object | Cloud env-var bindings and local provider config (base URL, context length). Auto-managed by `fermi init` and `/model`. |

Override per-session via CLI: `fermi -c context_budget_percent=70`.

The `providers` key (auto-managed by `fermi init` and `/model`) holds your provider/model selection and local provider settings; the active selection is also cached in `state/model-selection.json`. Prefer running `fermi init` or using `/model` over editing these by hand.

## .env

API keys stored with `0600` permissions. The init wizard creates it automatically.

```bash
# Example ~/.fermi/.env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
FERMI_DEEPSEEK_API_KEY=...
FERMI_XIAOMI_API_KEY=...
FERMI_GLM_CODE_API_KEY=...
FERMI_KIMI_API_KEY=...
FERMI_MINIMAX_CN_API_KEY=...
```

For Kimi, MiniMax, GLM, DeepSeek, Xiaomi, and Qwen, Fermi stores endpoint-specific managed slots (e.g. `FERMI_QWEN_API_KEY`) and resolves them at startup. External env vars (e.g., `MOONSHOT_API_KEY`, `DASHSCOPE_API_KEY`) are only detected and imported during `fermi init` or when `/model` prompts for a missing key.

OpenAI (ChatGPT Login) and GitHub Copilot use OAuth flows instead of API keys.

## mcp.json

Optional. Configure MCP servers for additional tools. Create this file manually.

```json
{
  "server-name": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-something"],
    "env": {
      "API_KEY": "${MY_API_KEY}"
    }
  }
}
```

See [MCP Integration](/guide/mcp) for the full reference.

## state/oauth.json

Auto-managed. Stores OAuth tokens for both the ChatGPT login flow and GitHub Copilot (under separate fields). Lives at `~/.fermi/state/oauth.json`. Use `fermi oauth` commands to manage.

## agent_templates/

Add new sub-agent templates by placing directories here:

```text
~/.fermi/agent_templates/
└── my-template/
    ├── agent.yaml
    └── system_prompt.md
```

User-global templates can only **add** new templates — they cannot override the bundled `explorer` / `executor` / `reviewer` / `main` templates. To override a bundled template, place it in **project-local** `.fermi/agent_templates/` (in the project root), which takes highest priority.

## skills/

User-installed skills. Each skill is a directory containing a `SKILL.md` file:

```text
~/.fermi/skills/
├── explain-code/
│   └── SKILL.md
├── skill-manager/
│   └── SKILL.md
└── .staging/           # Temporary work area (ignored by skill loader)
```

See [Skills](/guide/skills) for details.

## AGENTS.md Files

Two `AGENTS.md` files provide persistent memory across sessions:

- **`~/.fermi/AGENTS.md`** — Global preferences across all projects
- **`<project>/AGENTS.md`** — Project-specific patterns and conventions

The global file lives inside `~/.fermi/`; the project file lives in the project root. Their contents are loaded into the system prompt (re-read at session init and on reload, e.g. after editing `AGENTS.md` or `/reload`), so they're present on every turn, and the agent can write to them.

## CLI Flags

```text
fermi                     # Start a session in the current directory
fermi init                # Run the setup wizard
fermi --version           # Show version
fermi --templates <path>  # Use a specific templates directory
fermi --verbose           # Enable debug logging
fermi -c key=value        # Override a setting for this session
fermi --resume            # Resume the most recent session
fermi --model <id>        # Start with a specific model
fermi --agent <template>  # Start with a specific agent template
fermi update [--check]    # Stage the latest GitHub release for next restart
fermi oauth [action] [service]  # Manage OAuth login (Codex / Copilot)
fermi sessions [--json]   # List saved sessions
fermi fix                 # Repair a broken install/config
```

## Asset Discovery Priority

Templates, prompts, skills, and hooks are discovered in this order:

1. **CLI flag** (e.g., `--templates`)
2. **Workspace** (`.fermi/` in the current working directory)
3. **Project store** (`~/.fermi/projects/<name>_<hash>/.fermi/` — system-managed per-project state)
4. **User-global** (`~/.fermi/`)
5. **Bundled defaults** (installed package)

Earlier layers take priority over later ones.
