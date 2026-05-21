/**
 * Kimi (Moonshot) Anthropic-compatible provider.
 *
 * Endpoints:
 *   - Global: https://api.moonshot.ai/anthropic
 *   - China:  https://api.moonshot.cn/anthropic
 *
 * Verified live (2026-05): the endpoint returns standard Anthropic Messages
 * shape with structured thinking/text blocks. Backend runs automatic prefix
 * cache — `cache_control` markers are unnecessary. `thinking.signature` is
 * absent (open-source model) so we do not round-trip it.
 *
 * Vendor quirks: K2.5 thinking requires temperature=1.
 */

import type { ModelConfig } from "../config.js";
import { getProviderDefaultBaseUrl } from "../provider-defaults.js";
import { BaseAnthropicProvider } from "./anthropic-base.js";
import type { SendMessageOptions } from "./base.js";

export class KimiAnthropicProvider extends BaseAnthropicProvider {
  constructor(config: ModelConfig) {
    super(config);
  }

  protected override _defaultBaseUrl(): string {
    return getProviderDefaultBaseUrl(this._config.provider) ?? "https://api.moonshot.ai/anthropic";
  }

  protected override _convertWebSearchTool(): Record<string, unknown> {
    return {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 20,
    };
  }

  protected override _applySamplingParams(
    kwargs: Record<string, unknown>,
    options?: SendMessageOptions,
  ): void {
    const thinkingOff = options?.thinkingLevel === "off" || options?.thinkingLevel === "none";
    if (this._config.supportsThinking && !thinkingOff) {
      // Kimi K2.5/K2.6 thinking mode requires temperature=1.
      kwargs["temperature"] = 1;
      return;
    }
    const t = options?.temperature !== undefined ? options.temperature : this._config.temperature;
    if (t !== undefined) {
      kwargs["temperature"] = t;
    }
  }
}
