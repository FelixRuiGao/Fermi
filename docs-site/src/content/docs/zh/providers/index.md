---
title: "支持的提供商"
---

Fermi 支持云端 API 和本地推理服务器。使用 `fermi init` 配置任意组合。

## 提供商表

| 提供商 | 模型 | 认证 |
|--------|------|------|
| **Anthropic** | Claude Haiku 4.5、Sonnet 4.6、Opus 4.6（含 1M 上下文变体）、Opus 4.7 | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-5.2、5.2 Codex、5.3 Codex、5.4、5.4 Mini、5.4 Nano、5.5 | `OPENAI_API_KEY` 或 OAuth |
| **GitHub Copilot** | 从你的套餐目录实时获取，例如 Claude Opus 4.8/4.7、Sonnet 4.6、GPT-5.3 Codex、5.4、5.4 Mini、5.5、5 Mini | `/copilot` device-flow 登录 |
| **DeepSeek** | V4 Flash、V4 Pro | 托管槽位 (`FERMI_DEEPSEEK_*`) |
| **Kimi / Moonshot** | K2.6、K2.5、K2 Instruct（Global、China、Code 变体） | 托管槽位 (`FERMI_KIMI_*`) |
| **MiniMax** | M2.5、M2.5 Highspeed、M2.7、M2.7 Highspeed（Global、China） | 托管槽位 (`FERMI_MINIMAX_*`) |
| **GLM / Zhipu** | GLM-5.1、5、5 Turbo、5V Turbo、4.7（Global、China、Code 变体） | 托管槽位 (`FERMI_GLM_*`) |
| **Xiaomi (MiMo)** | V2.5、V2.5 Pro | 托管槽位 (`FERMI_XIAOMI_*`) |
| **Qwen / DashScope** | Qwen3.6 Plus、Qwen3.7 Max（中国、新加坡、美国区域） | 托管槽位 (`FERMI_QWEN_*`) |
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
