/**
 * Provider factory — maps provider identifiers to concrete provider classes.
 *
 * Dispatch is data-driven: provider id → providerClass (from the provider
 * registry) → constructor. The few valid non-preset ids (openai-chat, the
 * kimi-ai alias) keep explicit class mappings here.
 */

import type { ModelConfig } from "../config.js";
import { type ProviderClassKind } from "../model-registry.js";
import { EFFECTIVE_PROVIDER_SPECS } from "../registry-effective.js";
import type { BaseProvider } from "./base.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIResponsesProvider } from "./openai-responses.js";
import { OpenAIChatProvider } from "./openai-chat.js";
import { QwenResponsesProvider } from "./qwen-responses.js";
import { GLMProvider } from "./glm.js";
import { OpenRouterProvider } from "./openrouter.js";
import { CopilotProvider } from "./copilot.js";
import { KimiAnthropicProvider } from "./kimi-anthropic.js";
import { DeepSeekAnthropicProvider } from "./deepseek-anthropic.js";
import { MiniMaxAnthropicProvider } from "./minimax-anthropic.js";
import { XiaomiAnthropicProvider } from "./xiaomi-anthropic.js";

// DEPRECATED — superseded by *-anthropic.ts variants. Kept importable for rollback only.
// import { KimiProvider } from "./kimi.js";
// import { MiniMaxProvider } from "./minimax.js";
// import { DeepSeekProvider } from "./deepseek.js";
// import { XiaomiProvider } from "./xiaomi.js";

type ProviderCtor = new (config: ModelConfig) => BaseProvider;

const CTOR_BY_CLASS: Record<ProviderClassKind, ProviderCtor> = {
  "anthropic": AnthropicProvider,
  "openai-responses": OpenAIResponsesProvider,
  "openai-chat": OpenAIChatProvider,
  "qwen-responses": QwenResponsesProvider,
  "glm": GLMProvider,
  "openrouter": OpenRouterProvider,
  "copilot": CopilotProvider,
  "kimi-anthropic": KimiAnthropicProvider,
  "deepseek-anthropic": DeepSeekAnthropicProvider,
  "minimax-anthropic": MiniMaxAnthropicProvider,
  "xiaomi-anthropic": XiaomiAnthropicProvider,
};

/** Provider-class mappings for valid ids that aren't picker presets. */
const EXTRA_PROVIDER_CLASSES: Record<string, ProviderClassKind> = {
  "openai-chat": "openai-chat",
  "kimi-ai": "kimi-anthropic",
};

export function createProvider(config: ModelConfig): BaseProvider {
  const provider = config.provider.toLowerCase();
  const providerClass = EFFECTIVE_PROVIDER_SPECS.find(spec => spec.id === provider)?.providerClass
    ?? EXTRA_PROVIDER_CLASSES[provider];
  if (providerClass) {
    return new CTOR_BY_CLASS[providerClass](config);
  }
  // Custom provider (arbitrary name + base_url): dispatch by wire protocol
  // instead of by a known id. Anthropic-compatible endpoints use the Anthropic
  // class; everything else is treated as OpenAI-compatible chat.
  if (config.baseUrl) {
    return config.transportProtocol === "anthropic"
      ? new AnthropicProvider(config)
      : new OpenAIChatProvider(config);
  }
  const supported = [...new Set([...EFFECTIVE_PROVIDER_SPECS.map(spec => spec.id), ...Object.keys(EXTRA_PROVIDER_CLASSES)])].sort().join(", ");
  throw new Error(`Unknown provider '${config.provider}'. Supported: ${supported}`);
}
