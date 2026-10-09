---
title: "支持的提供商"
---

Fermi 支持云端 API 和本地推理服务器。使用 `fermi init` 配置任意组合。

## 提供商表

| 提供商 | 模型 | 认证 |
|--------|------|------|
| **Anthropic** | Claude Fable 5.1, Opus/Sonnet/Haiku 5.5, active earlier models | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-6.1 Sol, GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna, active earlier models | `OPENAI_API_KEY` 或 OAuth |
| **GitHub Copilot** | Current Claude/GPT, Gemini Flash, Kimi K3, MAI-Code; filtered by account catalog | `/copilot` device-flow 登录 |
| **DeepSeek** | V4.1 Flash (vision), V4 Pro (0813, text) | 托管槽位 (`FERMI_DEEPSEEK_*`) |
| **Kimi / Moonshot** | K3, K2.7 Code/Highspeed, K2.6; separate Coding IDs | 托管槽位 (`FERMI_KIMI_*`) |
| **MiniMax** | M3.1 Flash Preview (M Plan), M3, M2.7/2.5 + Highspeed | 托管槽位 (`FERMI_MINIMAX_*`) |
| **GLM / Zhipu** | 5.3, 5.3 Flash, 5.2; FlashX on standard API only | 托管槽位 (`FERMI_GLM_*`) |
| **Xiaomi (MiMo)** | V2.6 Pro/Flash/UltraSpeed; V2.5 retires 2026-10-21 | 托管槽位 (`FERMI_XIAOMI_*`) |
| **Qwen / DashScope** | 3.8 Max/Flash/Omni, 3.7 Plus/Flash, regional open models | 托管槽位 (`FERMI_QWEN_*`) |
| **OpenRouter** | 多厂商精选预设（Claude、GPT、Kimi、MiniMax、GLM、DeepSeek、Qwen、Xiaomi）+ 任意自定义模型 | `OPENROUTER_API_KEY` |
| **Ollama** | 任意本地模型（动态发现） | — |
| **oMLX** | 任意本地 MLX 模型（动态发现） | — |
| **LM Studio** | 任意本地 GGUF 模型（动态发现） | — |

## 云端 vs. 本地

**云端提供商**需要 API key 或 OAuth 登录。初始化向导会提示输入 key，并保存到 `~/.fermi/.env`。Kimi、MiniMax、GLM、DeepSeek、Xiaomi 和 Qwen 使用 Fermi 管理的内部槽位。GitHub Copilot 使用自己的 `/copilot` device-flow OAuth。OpenAI（ChatGPT Login）把 OAuth token 保存到 `~/.fermi/state/oauth.json`。

**本地提供商**（Ollama、oMLX、LM Studio）连接到你机器上的服务器，不需要 API key。运行 `fermi init` 时，向导会查询服务器的模型端点来发现可用模型。

## 运行时切换

会话中使用 `/model` 可以切换到任何已配置模型。对缺少 key 的提供商，选择模型时可以现场提示你导入或粘贴 key。

使用 `/tier` 可以为子代理分配 high/medium/low 层级模型。

详情见[模型切换](/zh/guide/model-switching)。

## 已知限制

第三方 coding 计划（Kimi-Code、GLM-Code）使用白名单访问控制。除非你的账号有明确访问权限，否则这些端点会拒绝请求。标准 API 端点正常可用。

## 设置指南

- [云端提供商](/zh/providers/cloud) — Anthropic、OpenAI、DeepSeek、Kimi、GLM、MiniMax、Xiaomi、Qwen、OpenRouter
- [GitHub Copilot](/zh/providers/copilot) — 使用你的 GitHub Copilot 订阅
- [本地提供商](/zh/providers/local) — Ollama、oMLX、LM Studio
- [ChatGPT OAuth 登录](/zh/providers/openai-oauth) — 使用 ChatGPT 账号代替 API key
