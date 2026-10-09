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
import { makeAnthropicSSERepairFetch } from "./anthropic-sse-repair.js";
import { BaseAnthropicProvider } from "./anthropic-base.js";
import type { SendMessageOptions } from "./base.js";

export class KimiAnthropicProvider extends BaseAnthropicProvider {
  constructor(config: ModelConfig) {
    super(config);
  }

  protected override _defaultBaseUrl(): string {
    return getProviderDefaultBaseUrl(this._config.provider) ?? "https://api.moonshot.ai/anthropic";
  }

  /**
   * Kimi's `/anthropic` web_search emits `input_json_delta` events without a
   * `partial_json` field on degenerate (empty) searches, which crashes the
   * SDK's stream parser. Repair the SSE before the SDK sees it.
   */
  protected override _wrapFetch() {
    return makeAnthropicSSERepairFetch();
  }

  /**
   * Kimi prepends a "Search results for query: ..." text block before its
   * server-side web_search on every search turn. Suppress it from the live
   * stream (only relevant when web search is actually enabled).
   */
  protected override _dropsLeadingSearchPreamble(): boolean {
    return this._config.supportsWebSearch;
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
    if (/^(?:kimi-k[23]|k3|kimi-for-coding)/.test(this._config.model)) {
      // Current Kimi models have fixed sampling; leave defaults to the server.
      return;
    }
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

  protected override _applyThinkingParams(
    kwargs: Record<string, unknown>,
    options?: SendMessageOptions,
  ): void {
    const model = this._config.model;
    const effortModel = /^(?:kimi-k3|k3(?:-256k)?|kimi-for-coding)$/.test(model);
    if (!effortModel) {
      super._applyThinkingParams(kwargs, options);
      return;
    }
    const level = options?.thinkingLevel;
    if ((level === "off" || level === "none") && this._config.provider === "kimi-code") {
      kwargs["thinking"] = { type: "disabled" };
      return;
    }
    // K3's Messages API is effort-only; a K2-style thinking object is invalid.
    delete kwargs["thinking"];
    kwargs["output_config"] = {
      effort: level === "low" || level === "off" || level === "none" ? "low"
        : level === "high" || level === "medium" ? "high"
        : level === "max" || level === "xhigh" ? "max"
        : this._config.provider === "kimi-code" && model.startsWith("k3") ? "high" : "max",
    };
  }

  protected override _applyCacheBreakpoint(kwargs: Record<string, unknown>): void {
    // K3 reads but does not write its prefix cache unless this top-level
    // policy is sent. K2.x and Coding retain their automatic cache behavior.
    if (this._config.model === "kimi-k3" && this._config.provider !== "kimi-code") {
      kwargs["cache_control"] = { type: "ephemeral", ttl: "5m" };
    }
  }
}
