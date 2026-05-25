/**
 * Provider factory — maps provider identifiers to concrete provider classes.
 */

import type { ModelConfig } from "../config.js";
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

export function createProvider(config: ModelConfig): BaseProvider {
  const provider = config.provider.toLowerCase();

  if (provider === "anthropic") {
    return new AnthropicProvider(config);
  }

  if (provider === "openai" || provider === "openai-codex") {
    return new OpenAIResponsesProvider(config);
  }

  if (provider === "copilot") {
    return new CopilotProvider(config);
  }

  if (provider === "openai-chat" || provider === "ollama" || provider === "omlx" || provider === "lmstudio") {
    return new OpenAIChatProvider(config);
  }

  if (provider === "qwen" || provider === "qwen-intl" || provider === "qwen-us") {
    return new QwenResponsesProvider(config);
  }

  // Kimi / Moonshot — migrated to Anthropic protocol (2026-05).
  if (provider === "kimi-cn" || provider === "kimi-ai" || provider === "kimi" || provider === "kimi-code") {
    return new KimiAnthropicProvider(config);
  }

  if (provider === "glm" || provider === "glm-intl" || provider === "glm-code" || provider === "glm-intl-code") {
    return new GLMProvider(config);
  }

  // MiniMax — migrated to Anthropic protocol (2026-05).
  if (provider === "minimax" || provider === "minimax-cn") {
    return new MiniMaxAnthropicProvider(config);
  }

  // DeepSeek — migrated to Anthropic protocol (2026-05).
  if (provider === "deepseek") {
    return new DeepSeekAnthropicProvider(config);
  }

  // Xiaomi (MiMo) — migrated to Anthropic protocol (2026-05).
  if (provider === "xiaomi") {
    return new XiaomiAnthropicProvider(config);
  }

  if (provider === "openrouter") {
    return new OpenRouterProvider(config);
  }

  throw new Error(
    `Unknown provider '${config.provider}'. ` +
      "Supported: anthropic, openai, openai-codex, copilot, openai-chat, ollama, omlx, lmstudio, " +
      "qwen, qwen-intl, qwen-us, " +
      "kimi, kimi-cn, kimi-ai, kimi-code, " +
      "glm, glm-intl, glm-code, glm-intl-code, minimax, minimax-cn, " +
      "deepseek, xiaomi, openrouter",
  );
}
