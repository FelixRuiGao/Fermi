/**
 * Shared default base URLs for provider transports.
 *
 * Both Config resolution and provider subclasses use this table so transport
 * migration does not drift into duplicated fallback logic.
 */

export const PROVIDER_DEFAULT_BASE_URLS: Record<string, string> = {
  "anthropic": "https://api.anthropic.com",
  "openai": "https://api.openai.com/v1",
  "openai-chat": "https://api.openai.com/v1",
  "ollama": "http://localhost:11434/v1",
  "omlx": "http://localhost:8000/v1",
  "lmstudio": "http://localhost:1234/v1",
  "openai-codex": "https://chatgpt.com/backend-api/codex",
  // Kimi / Moonshot — Anthropic protocol
  "kimi": "https://api.moonshot.ai/anthropic",
  "kimi-cn": "https://api.moonshot.cn/anthropic",
  "kimi-ai": "https://api.moonshot.ai/anthropic",
  "kimi-code": "https://api.kimi.com/coding",
  // GLM / Zhipu — OpenAI-compatible Chat
  "glm": "https://open.bigmodel.cn/api/paas/v4",
  "glm-intl": "https://api.z.ai/api/paas/v4",
  "glm-code": "https://open.bigmodel.cn/api/coding/paas/v4",
  "glm-intl-code": "https://api.z.ai/api/coding/paas/v4",
  // MiniMax / DeepSeek / Xiaomi — Anthropic protocol
  "minimax": "https://api.minimax.io/anthropic",
  "minimax-cn": "https://api.minimaxi.com/anthropic",
  "deepseek": "https://api.deepseek.com/anthropic",
  "xiaomi": "https://api.xiaomimimo.com/anthropic",
  "openrouter": "https://openrouter.ai/api/v1",
};

export function getProviderDefaultBaseUrl(providerId: string): string | undefined {
  return PROVIDER_DEFAULT_BASE_URLS[providerId];
}
