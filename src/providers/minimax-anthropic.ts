/**
 * MiniMax Anthropic-compatible provider.
 *
 * Endpoints:
 *   - Global: https://api.minimax.io/anthropic
 *   - China:  https://api.minimaxi.com/anthropic
 *
 * Verified live (2026-05): standard Anthropic Messages shape; backend runs
 * automatic prefix cache (no `cache_control` needed — verified by hitting the
 * same prefix across two requests without any marker and seeing
 * `cache_read_input_tokens` jump on the second turn).
 *
 * MiniMax does emit a real-looking `signature` (64-char hex) on thinking
 * blocks, but it is NOT cryptographically validated — a fake signature
 * round-trips successfully. Open-source model, so we do not round-trip it.
 *
 * Current API sampling range is [0, 2]. M3 uses adaptive thinking; M3.1
 * Preview always thinks and accepts output_config.effort.
 */

import { BaseAnthropicProvider } from "./anthropic-base.js";
import type { ModelConfig } from "../config.js";
import { getProviderDefaultBaseUrl } from "../provider-defaults.js";
import type { SendMessageOptions } from "./base.js";

export class MiniMaxAnthropicProvider extends BaseAnthropicProvider {
  constructor(config: ModelConfig) {
    super(config);
  }

  protected override _defaultBaseUrl(): string {
    return getProviderDefaultBaseUrl(this._config.provider) ?? "https://api.minimax.io/anthropic";
  }

  protected override _applySamplingParams(
    kwargs: Record<string, unknown>,
    options?: SendMessageOptions,
  ): void {
    const raw = options?.temperature !== undefined ? options.temperature : this._config.temperature;
    if (raw === undefined) return;
    kwargs["temperature"] = Math.max(0, Math.min(2, raw));
  }

  protected override _applyThinkingParams(
    kwargs: Record<string, unknown>,
    options?: SendMessageOptions,
  ): void {
    if (!this._config.supportsThinking) return;
    const model = this._config.model.toLowerCase();
    const level = options?.thinkingLevel;
    if (model.startsWith("minimax-m3.1")) {
      kwargs["thinking"] = { type: "adaptive" };
      kwargs["output_config"] = {
        effort: level && ["low", "medium", "high", "xhigh", "max"].includes(level) ? level
          : level === "off" || level === "none" ? "low" : "max",
      };
    } else if (model === "minimax-m3") {
      kwargs["thinking"] = { type: level === "off" || level === "none" ? "disabled" : "adaptive" };
    } else {
      kwargs["thinking"] = { type: "adaptive" };
    }
  }

  protected override _convertWebSearchTool(): Record<string, unknown> {
    return { type: "web_search_20250305", name: "web_search" };
  }
}
