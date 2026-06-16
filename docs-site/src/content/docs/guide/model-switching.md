---
title: "Model Switching"
---

Fermi lets you switch between models at any point during a session. Thinking level is configured as part of the model switch flow.

## The `/model` Command

Type `/model` during a session to open a hierarchical picker:

```text
/model
```

The picker shows all configured providers and their models. Select one and the agent switches immediately for the remainder of the session.

For managed providers (Kimi, MiniMax, GLM, DeepSeek, Xiaomi, Qwen), if you select a model whose key is missing, Fermi can prompt you to import a detected external env var or paste the key directly.

## Managing API Keys

The `/model` flow prompts for a key only when one is missing. To manage keys directly — add, replace, remove, or import a provider's API key at any time — use `/key`:

```text
/key
```

It opens a picker of provider endpoints; choose one and then pick an action. Keys live in `~/.fermi/.env` (`0600` permissions). This is the easiest way to rotate a key or fix one that was entered incorrectly without re-running `fermi init`.

The `/model` command itself is useful for:
- Starting with a fast/cheap model for exploration, then switching to a stronger model for implementation
- Moving to a cheaper model when the task becomes routine
- Testing how different models handle the same context

## Thinking Levels

After switching models, Fermi prompts you to select a thinking level (if the model supports multiple levels). The available levels vary by provider:

| Provider | Levels |
|----------|--------|
| **Anthropic (Opus 4.7)** | off, low, medium, high, xhigh, max |
| **Anthropic (Opus 4.6)** | off, low, medium, high, max |
| **Anthropic (Sonnet 4.6)** | off, low, medium, high |
| **Anthropic (Haiku 4.5)** | off, low, medium, high |
| **OpenAI** | none, low, medium, high, xhigh |
| **DeepSeek** | off, high, max |
| **Kimi** | off, on |
| **GLM** | off, on |
| **Xiaomi (MiMo)** | off, on |
| **Qwen** | off, on |
| **MiniMax** | on (M3 also supports off) |
| **GitHub Copilot** | follows the underlying model's levels |

A few newer models differ from their provider's general pattern: **GLM-5.2** uses `high` / `max`, **Kimi K2.7 Code** is `on` only, and **Kimi K2 Instruct** has no thinking control. The picker always shows the exact levels each model supports.

Higher reasoning depth produces more thorough analysis but uses more tokens and takes longer.

## Model Tiers for Sub-Agents

Use `/tier` to configure which models sub-agents use at different capability levels:

```text
/tier
```

This opens a picker where you assign specific models to three tiers:

| Tier | Typical use |
|------|-------------|
| **high** | Complex reasoning, architectural decisions |
| **medium** | Standard implementation work |
| **low** | Simple tasks — file listing, grep, basic edits |

When the agent spawns a sub-agent with `model_level="low"`, it uses the model assigned to the low tier. This saves cost on routine work while keeping the main agent on a powerful model.

## Adding More Models

Models come from the providers you configure during `fermi init`. To add more:

1. Re-run `fermi init` to add new providers
2. For local providers, start the server and re-run init to discover new models
3. For OpenRouter, any model available through their API can be used

For OpenAI (ChatGPT Login), use `fermi oauth` or `/codex` to authenticate. For GitHub Copilot, use `/copilot` to log in first.
