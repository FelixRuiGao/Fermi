---
title: "Supported Providers"
---

Fermi supports cloud APIs and local inference servers. Use `fermi init` to configure any combination.

## Provider Table

| Provider | Models | Auth |
|----------|--------|------|
| **Anthropic** | Claude Fable 5.1, Opus/Sonnet/Haiku 5.5, active earlier models | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-6.1 Sol, GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna, active earlier models | `OPENAI_API_KEY` or OAuth |
| **GitHub Copilot** | Current Claude/GPT, Gemini Flash, Kimi K3, MAI-Code; filtered by account catalog | `/copilot` device-flow login |
| **DeepSeek** | V4.1 Flash (vision), V4 Pro (0813, text) | Managed slot (`FERMI_DEEPSEEK_*`) |
| **Kimi / Moonshot** | K3, K2.7 Code/Highspeed, K2.6; separate Coding IDs | Managed slots (`FERMI_KIMI_*`) |
| **MiniMax** | M3.1 Flash Preview (M Plan), M3, M2.7/2.5 + Highspeed | Managed slots (`FERMI_MINIMAX_*`) |
| **GLM / Zhipu** | 5.3, 5.3 Flash, 5.2; FlashX on standard API only | Managed slots (`FERMI_GLM_*`) |
| **Xiaomi (MiMo)** | V2.6 Pro/Flash/UltraSpeed; V2.5 retires 2026-10-21 | Managed slot (`FERMI_XIAOMI_*`) |
| **Qwen / DashScope** | 3.8 Max/Flash/Omni, 3.7 Plus/Flash, regional open models | Managed slots (`FERMI_QWEN_*`) |
| **OpenRouter** | Multi-vendor curated presets (Claude, GPT, Kimi, MiniMax, GLM, DeepSeek, Qwen, Xiaomi) + any custom model | `OPENROUTER_API_KEY` |
| **Ollama** | Any local model (dynamic discovery) | — |
| **oMLX** | Any local MLX model (dynamic discovery) | — |
| **LM Studio** | Any local GGUF model (dynamic discovery) | — |

## Cloud vs. Local

**Cloud providers** require either an API key or an OAuth login. The init wizard prompts for keys and stores them in `~/.fermi/.env`. Kimi, MiniMax, GLM, DeepSeek, Xiaomi, and Qwen use Fermi-managed internal slots. GitHub Copilot uses its own device-flow OAuth via `/copilot`. OpenAI (ChatGPT Login) stores OAuth tokens in `~/.fermi/state/oauth.json`.

**Local providers** (Ollama, oMLX, LM Studio) connect to a server on your machine. No API key needed. During `fermi init`, the wizard queries the server's model endpoint to discover available models.

## Switching at Runtime

Use `/model` during a session to switch between any configured model. For providers with missing keys, selecting a model can prompt you to import or paste the key on the spot.

Use `/tier` to assign models to high/medium/low tiers for sub-agents.

See [Model Switching](/guide/model-switching) for details.

## Known Limitations

Third-party coding plans (Kimi-Code, GLM-Code) use whitelist-based access control. Unless your account has explicit access, these endpoints will reject requests. Standard API endpoints work normally.

## Setup Guides

- [Cloud Providers](/providers/cloud) — Anthropic, OpenAI, DeepSeek, Kimi, GLM, MiniMax, Xiaomi, Qwen, OpenRouter
- [GitHub Copilot](/providers/copilot) — Use your GitHub Copilot subscription
- [Local Providers](/providers/local) — Ollama, oMLX, LM Studio
- [ChatGPT OAuth Login](/providers/openai-oauth) — Use your ChatGPT account instead of an API key
