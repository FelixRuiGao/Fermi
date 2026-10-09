---
title: "Cloud Providers"
---

This page covers setup for cloud-based API providers. For GitHub Copilot, see [GitHub Copilot](/providers/copilot). For ChatGPT OAuth, see [ChatGPT OAuth Login](/providers/openai-oauth).

## Anthropic

**Models:** Claude Fable 5.1/5, Opus 5.5/5/4.8, Sonnet 5.5/5, Haiku 5.5, and active 4.x models.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/).
2. Run `fermi init` and select **Anthropic (Claude)**.
3. Paste your API key when prompted.

The key is stored as `ANTHROPIC_API_KEY` in `~/.fermi/.env`.

### Context and thinking

Opus/Sonnet 4.6 now have GA 1M context without a beta header. New 5.x models also support 1M. Legacy 1M selectors remain compatible.

Opus 5.5/Fable always think, and Sonnet 5.5 cannot fully disable thinking. They expose low/medium/high/xhigh/max. Haiku 5.5 also supports off.

## OpenAI

**Models:** GPT-6.1 Sol, GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna, GPT-5.5/5.4/5.2

1. Get an API key from [platform.openai.com](https://platform.openai.com/).
2. Run `fermi init` and select **OpenAI**.
3. Paste your API key when prompted.

The key is stored as `OPENAI_API_KEY` in `~/.fermi/.env`.

Alternatively, use your ChatGPT account via OAuth. See [ChatGPT OAuth Login](/providers/openai-oauth).

**Thinking levels:** GPT-5.6 and GPT-6 Sol/Luna: none, low, medium, high, xhigh, max. Astra and 6.1 Sol: low through max. Ultra is not a native API effort.

## DeepSeek

**Models:** DeepSeek V4.1 Flash (`deepseek-flash`, vision) and V4 Pro (0813, text). The legacy V4 Flash ID redirects to V4.1.

1. Get an API key from DeepSeek's developer portal.
2. Run `fermi init` and select **DeepSeek**.
3. Paste your API key when prompted.

The key is stored as a managed slot in `~/.fermi/.env`.

## Kimi / Moonshot

**Models:** Public API: Kimi K3, K2.7 Code/Highspeed, K2.6. Coding: `k3`, `k3-256k`, `kimi-for-coding` (K2.8 Preview), `kimi-for-coding-highspeed`.

Available through three endpoint variants:

| Variant | Endpoint | Fermi Slot | Detected External Env |
|---------|----------|------------------|-----------------------|
| **Kimi-Global** | `api.moonshot.ai` | `FERMI_KIMI_API_KEY` | `MOONSHOT_API_KEY`, `KIMI_API_KEY` |
| **Kimi-China** | `api.moonshot.cn` | `FERMI_KIMI_CN_API_KEY` | `MOONSHOT_API_KEY`, `KIMI_CN_API_KEY` |
| **Kimi-Code** | `api.kimi.com/coding` | `FERMI_KIMI_CODE_API_KEY` | `KIMI_CODE_API_KEY` |

:::caution
The Kimi-Code endpoint is restricted to whitelisted agents. You may receive a 403 error. Use `kimi` or `kimi-cn` (standard API) instead.
:::

1. Get an API key from Moonshot's developer portal.
2. Run `fermi init` and select **Moonshot (Kimi)**, then pick your variant.
3. Import a detected env var or paste your API key.

## GLM / Zhipu

**Models:** GLM-5.3, 5.3 Flash, 5.2, and compatible older models. 5.3 FlashX is API-only. 5.3 supports low/high/max and always thinks.

Available through four endpoint variants:

| Variant | Endpoint | Fermi Slot | Detected External Env |
|---------|----------|------------------|-----------------------|
| **GLM-China** | `open.bigmodel.cn` | `FERMI_GLM_API_KEY` | `GLM_API_KEY` |
| **GLM-Global** | `api.z.ai` | `FERMI_GLM_INTL_API_KEY` | `GLM_INTL_API_KEY` |
| **GLM-China-Code** | `open.bigmodel.cn/api/coding` | `FERMI_GLM_CODE_API_KEY` | `GLM_CODE_API_KEY` |
| **GLM-Global-Code** | `api.z.ai/api/coding` | `FERMI_GLM_INTL_CODE_API_KEY` | `GLM_INTL_CODE_API_KEY` |

:::caution
The GLM coding endpoints are restricted to whitelisted agents. Use `glm` or `glm-intl` (standard API) instead.
:::

1. Get an API key from Zhipu's developer portal.
2. Run `fermi init` and select **z.ai (GLM/Zhipu)**, then pick your variant.
3. Import a detected env var or paste your API key.

## MiniMax

**Models:** MiniMax M3.1 Flash Preview (M Plan only), M3, M2.7/2.5 and Highspeed.

Available through two endpoint variants:

| Variant | Endpoint | Fermi Slot | Detected External Env |
|---------|----------|------------------|-----------------------|
| **MiniMax-Global** | `api.minimax.io` | `FERMI_MINIMAX_API_KEY` | `MINIMAX_API_KEY` |
| **MiniMax-China** | `api.minimaxi.com` | `FERMI_MINIMAX_CN_API_KEY` | `MINIMAX_CN_API_KEY` |

1. Get an API key from MiniMax's developer portal.
2. Run `fermi init` and select **MiniMax**, then pick your variant.
3. Import a detected env var or paste your API key.

## Xiaomi (MiMo)

**Models:** MiMo V2.6 Pro, Flash, UltraSpeed (access required); V2.5/Pro retire on 2026-10-21.

1. Get an API key from Xiaomi's developer portal.
2. Run `fermi init` and select **Xiaomi (MiMo)**.
3. Paste your API key when prompted.

The key is stored as a managed slot in `~/.fermi/.env`.

## Qwen / DashScope

**Models:** Qwen3.8 Max, Max 0902, Flash, Omni Flash, 3.7 Plus/Flash; CN/Intl also offer 3.8 27B and 2.4T A95B. Compatible older models remain.

Available through three regional endpoint variants:

| Variant | Region | Fermi Slot | Detected External Env |
|---------|--------|------------|-----------------------|
| **Qwen** | China (Beijing) | `FERMI_QWEN_API_KEY` | `DASHSCOPE_API_KEY`, `QWEN_API_KEY` |
| **Qwen-Intl** | Singapore | `FERMI_QWEN_INTL_API_KEY` | `DASHSCOPE_INTL_API_KEY`, `QWEN_INTL_API_KEY` |
| **Qwen-US** | United States | `FERMI_QWEN_US_API_KEY` | `DASHSCOPE_US_API_KEY`, `QWEN_US_API_KEY` |

1. Get an API key from Alibaba Cloud's DashScope console.
2. Run `fermi init` and select **Qwen / DashScope**, then pick your region.
3. Import a detected env var or paste your API key.


Responses uses the new `/compatible-mode/v1` path. Native context is 1M, but the API reserves about 20% and may silently truncate excess input, so Fermi presets budget 800k. 3.8 exposes none/low/medium/xhigh; the 2.4T open model is thinking-only.

## OpenRouter

**Models:** Multi-vendor curated presets (Claude, GPT, Kimi, MiniMax, GLM, DeepSeek, Qwen, Xiaomi) plus any custom model.

OpenRouter acts as a unified API gateway to multiple model providers.

1. Get an API key from [openrouter.ai](https://openrouter.ai/).
2. Run `fermi init` and select **OpenRouter**.
3. Paste your API key.
4. Pick from the curated model presets.

The key is stored as `OPENROUTER_API_KEY` in `~/.fermi/.env`.
