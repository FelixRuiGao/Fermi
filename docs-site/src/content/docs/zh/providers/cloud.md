---
title: "云端提供商"
---

本页介绍云端 API 提供商的设置。GitHub Copilot 见 [GitHub Copilot](/zh/providers/copilot)。ChatGPT OAuth 见 [ChatGPT OAuth 登录](/zh/providers/openai-oauth)。

## Anthropic

**模型：** Claude Fable 5.1/5、Opus 5.5/5/4.8、Sonnet 5.5/5、Haiku 5.5，以及仍可用的 4.x 型号。

1. 从 [console.anthropic.com](https://console.anthropic.com/) 获取 API key。
2. 运行 `fermi init` 并选择 **Anthropic (Claude)**。
3. 按提示粘贴 API key。

key 会以 `ANTHROPIC_API_KEY` 保存到 `~/.fermi/.env`。

### 上下文与思考

Opus/Sonnet 4.6 的 1M 上下文已正式开放，不再需要 beta header。新 5.x 型号同样支持 1M。保留旧 1M 选择键用于兼容配置。

Opus 5.5/Fable 强制思考，Sonnet 5.5 也不能完全关闭思考；它们提供 low/medium/high/xhigh/max。Haiku 5.5 还支持 off。

## OpenAI

**模型：** GPT-6.1 Sol、GPT-6 Astra/Sol/Luna、GPT-5.6 Sol/Terra/Luna、GPT-5.5/5.4/5.2

1. 从 [platform.openai.com](https://platform.openai.com/) 获取 API key。
2. 运行 `fermi init` 并选择 **OpenAI**。
3. 按提示粘贴 API key。

key 会以 `OPENAI_API_KEY` 保存到 `~/.fermi/.env`。

也可以通过 OAuth 使用 ChatGPT 账号。见 [ChatGPT OAuth 登录](/zh/providers/openai-oauth)。

**Thinking levels：** GPT-5.6 与 GPT-6 Sol/Luna：none、low、medium、high、xhigh、max；Astra 与 6.1 Sol：low 至 max。Ultra 不是 API 思考档位。

## DeepSeek

**模型：** DeepSeek V4.1 Flash（`deepseek-flash`，支持图片）、V4 Pro（0813，纯文本）。旧 V4 Flash ID 兼容转发到 V4.1。

1. 从 DeepSeek 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **DeepSeek**。
3. 按提示粘贴 API key。

key 会作为托管槽位保存到 `~/.fermi/.env`。

## Kimi / Moonshot

**模型：** 标准 API：Kimi K3、K2.7 Code/Highspeed、K2.6。Coding：`k3`、`k3-256k`、`kimi-for-coding`（K2.8 Preview）、`kimi-for-coding-highspeed`。

提供三个端点变体：

| 变体 | 端点 | Fermi 槽位 | 检测的外部环境变量 |
|------|------|------------|--------------------|
| **Kimi-Global** | `api.moonshot.ai` | `FERMI_KIMI_API_KEY` | `MOONSHOT_API_KEY`, `KIMI_API_KEY` |
| **Kimi-China** | `api.moonshot.cn` | `FERMI_KIMI_CN_API_KEY` | `MOONSHOT_API_KEY`, `KIMI_CN_API_KEY` |
| **Kimi-Code** | `api.kimi.com/coding` | `FERMI_KIMI_CODE_API_KEY` | `KIMI_CODE_API_KEY` |

:::caution
Kimi-Code 端点仅对白名单代理开放。你可能会收到 403 错误。请改用 `kimi` 或 `kimi-cn`（标准 API）。
:::

1. 从 Moonshot 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **Moonshot (Kimi)**，然后选择变体。
3. 导入检测到的环境变量或粘贴 API key。

## GLM / Zhipu

**模型：** GLM-5.3、5.3 Flash、5.2 和兼容的旧型号；5.3 FlashX 仅标准 API 可用。5.3 支持 low/high/max，不能关闭思考。

提供四个端点变体：

| 变体 | 端点 | Fermi 槽位 | 检测的外部环境变量 |
|------|------|------------|--------------------|
| **GLM-China** | `open.bigmodel.cn` | `FERMI_GLM_API_KEY` | `GLM_API_KEY` |
| **GLM-Global** | `api.z.ai` | `FERMI_GLM_INTL_API_KEY` | `GLM_INTL_API_KEY` |
| **GLM-China-Code** | `open.bigmodel.cn/api/coding` | `FERMI_GLM_CODE_API_KEY` | `GLM_CODE_API_KEY` |
| **GLM-Global-Code** | `api.z.ai/api/coding` | `FERMI_GLM_INTL_CODE_API_KEY` | `GLM_INTL_CODE_API_KEY` |

:::caution
GLM coding 端点仅对白名单代理开放。请改用 `glm` 或 `glm-intl`（标准 API）。
:::

1. 从 Zhipu 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **z.ai (GLM/Zhipu)**，然后选择变体。
3. 导入检测到的环境变量或粘贴 API key。

## MiniMax

**模型：** MiniMax M3.1 Flash Preview（仅 M Plan）、M3、M2.7/2.5 及 Highspeed。

提供两个端点变体：

| 变体 | 端点 | Fermi 槽位 | 检测的外部环境变量 |
|------|------|------------|--------------------|
| **MiniMax-Global** | `api.minimax.io` | `FERMI_MINIMAX_API_KEY` | `MINIMAX_API_KEY` |
| **MiniMax-China** | `api.minimaxi.com` | `FERMI_MINIMAX_CN_API_KEY` | `MINIMAX_CN_API_KEY` |

1. 从 MiniMax 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **MiniMax**，然后选择变体。
3. 导入检测到的环境变量或粘贴 API key。

## Xiaomi (MiMo)

**模型：** MiMo V2.6 Pro、Flash、UltraSpeed（需要权限）；V2.5/Pro 将于 2026-10-21 退役。

1. 从 Xiaomi 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **Xiaomi (MiMo)**。
3. 按提示粘贴 API key。

key 会作为托管槽位保存到 `~/.fermi/.env`。

## Qwen / DashScope

**模型：** Qwen3.8 Max、Max 0902、Flash、Omni Flash，3.7 Plus/Flash；中国/国际入口还提供 3.8 27B、2.4T A95B。保留兼容旧型号。

提供三个区域端点变体：

| 变体 | 区域 | Fermi 槽位 | 检测的外部环境变量 |
|------|------|------------|--------------------|
| **Qwen** | China (Beijing) | `FERMI_QWEN_API_KEY` | `DASHSCOPE_API_KEY`, `QWEN_API_KEY` |
| **Qwen-Intl** | Singapore | `FERMI_QWEN_INTL_API_KEY` | `DASHSCOPE_INTL_API_KEY`, `QWEN_INTL_API_KEY` |
| **Qwen-US** | United States | `FERMI_QWEN_US_API_KEY` | `DASHSCOPE_US_API_KEY`, `QWEN_US_API_KEY` |

1. 从 Alibaba Cloud 的 DashScope 控制台获取 API key。
2. 运行 `fermi init` 并选择 **Qwen / DashScope**，然后选择区域。
3. 导入检测到的环境变量或粘贴 API key。


Responses 使用新的 `/compatible-mode/v1` 路径。模型原生上下文为 1M，但 API 预留约 20%，超出输入可能被静默截断，因此 Fermi 默认预算为 800k。3.8 提供 none/low/medium/xhigh；2.4T 开源模型仅支持思考。

## OpenRouter

**模型：** 多厂商精选预设（Claude、GPT、Kimi、MiniMax、GLM、DeepSeek、Qwen、Xiaomi）以及任意自定义模型。

OpenRouter 是连接多个模型提供商的统一 API 网关。

1. 从 [openrouter.ai](https://openrouter.ai/) 获取 API key。
2. 运行 `fermi init` 并选择 **OpenRouter**。
3. 粘贴 API key。
4. 从精选模型预设中选择。

key 会以 `OPENROUTER_API_KEY` 保存到 `~/.fermi/.env`。
