---
title: "云端提供商"
---

本页介绍云端 API 提供商的设置。GitHub Copilot 见 [GitHub Copilot](/zh/providers/copilot)。ChatGPT OAuth 见 [ChatGPT OAuth 登录](/zh/providers/openai-oauth)。

## Anthropic

**模型：** Claude Haiku 4.5、Sonnet 4.6、Sonnet 4.6（1M 上下文）、Opus 4.6、Opus 4.6（1M 上下文）、Opus 4.7

1. 从 [console.anthropic.com](https://console.anthropic.com/) 获取 API key。
2. 运行 `fermi init` 并选择 **Anthropic (Claude)**。
3. 按提示粘贴 API key。

key 会以 `ANTHROPIC_API_KEY` 保存到 `~/.fermi/.env`。

### 1M Context Beta

Sonnet 4.6 和 Opus 4.6 的 1M 上下文变体会作为独立模型选项出现。它们使用 Anthropic 的 extended context beta，允许最多 1,000,000 token 的上下文。

**Thinking levels：** Opus 4.7: off, low, medium, high, xhigh, max。Opus 4.6: off, low, medium, high, max。Sonnet/Haiku: off, low, medium, high。

## OpenAI

**模型：** GPT-5.2、GPT-5.2 Codex、GPT-5.3 Codex、GPT-5.4、GPT-5.4 Mini、GPT-5.4 Nano、GPT-5.5

1. 从 [platform.openai.com](https://platform.openai.com/) 获取 API key。
2. 运行 `fermi init` 并选择 **OpenAI**。
3. 按提示粘贴 API key。

key 会以 `OPENAI_API_KEY` 保存到 `~/.fermi/.env`。

也可以通过 OAuth 使用 ChatGPT 账号。见 [ChatGPT OAuth 登录](/zh/providers/openai-oauth)。

**Thinking levels：** none, low, medium, high, xhigh。

## DeepSeek

**模型：** DeepSeek V4 Flash、DeepSeek V4 Pro

1. 从 DeepSeek 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **DeepSeek**。
3. 按提示粘贴 API key。

key 会作为托管槽位保存到 `~/.fermi/.env`。

## Kimi / Moonshot

**模型：** Kimi K2.7 Code、K2.6、K2.5、K2 Instruct

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

**模型：** GLM-5.1、GLM-5、GLM-5 Turbo、GLM-5V Turbo、GLM-4.7。两个 coding 端点还额外提供 **GLM-5.2**。

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

**模型：** MiniMax M3、M2.5、M2.5 Highspeed、M2.7、M2.7 Highspeed

提供两个端点变体：

| 变体 | 端点 | Fermi 槽位 | 检测的外部环境变量 |
|------|------|------------|--------------------|
| **MiniMax-Global** | `api.minimax.io` | `FERMI_MINIMAX_API_KEY` | `MINIMAX_API_KEY` |
| **MiniMax-China** | `api.minimaxi.com` | `FERMI_MINIMAX_CN_API_KEY` | `MINIMAX_CN_API_KEY` |

1. 从 MiniMax 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **MiniMax**，然后选择变体。
3. 导入检测到的环境变量或粘贴 API key。

## Xiaomi (MiMo)

**模型：** MiMo V2.5、MiMo V2.5 Pro

1. 从 Xiaomi 开发者门户获取 API key。
2. 运行 `fermi init` 并选择 **Xiaomi (MiMo)**。
3. 按提示粘贴 API key。

key 会作为托管槽位保存到 `~/.fermi/.env`。

## Qwen / DashScope

**模型：** Qwen3.6 Plus、Qwen3.7 Plus、Qwen3.7 Max

提供三个区域端点变体：

| 变体 | 区域 | Fermi 槽位 | 检测的外部环境变量 |
|------|------|------------|--------------------|
| **Qwen** | China (Beijing) | `FERMI_QWEN_API_KEY` | `DASHSCOPE_API_KEY`, `QWEN_API_KEY` |
| **Qwen-Intl** | Singapore | `FERMI_QWEN_INTL_API_KEY` | `DASHSCOPE_INTL_API_KEY`, `QWEN_INTL_API_KEY` |
| **Qwen-US** | United States | `FERMI_QWEN_US_API_KEY` | `DASHSCOPE_US_API_KEY`, `QWEN_US_API_KEY` |

1. 从 Alibaba Cloud 的 DashScope 控制台获取 API key。
2. 运行 `fermi init` 并选择 **Qwen / DashScope**，然后选择区域。
3. 导入检测到的环境变量或粘贴 API key。

## OpenRouter

**模型：** 多厂商精选预设（Claude、GPT、Kimi、MiniMax、GLM、DeepSeek、Qwen、Xiaomi）以及任意自定义模型。

OpenRouter 是连接多个模型提供商的统一 API 网关。

1. 从 [openrouter.ai](https://openrouter.ai/) 获取 API key。
2. 运行 `fermi init` 并选择 **OpenRouter**。
3. 粘贴 API key。
4. 从精选模型预设中选择。

key 会以 `OPENROUTER_API_KEY` 保存到 `~/.fermi/.env`。
