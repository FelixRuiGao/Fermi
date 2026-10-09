/**
 * GLM (Zhipu AI) provider adapter.
 *
 * Extends OpenAIChatProvider with thinking support and
 * native web_search tool format.
 */

import type { ModelConfig } from "../config.js";
import type { ToolDef } from "./base.js";
import { OpenAIChatProvider } from "./openai-chat.js";

export class GLMProvider extends OpenAIChatProvider {
  constructor(config: ModelConfig) {
    if (!config.baseUrl) {
      throw new Error(
        "GLM provider requires a base_url. " +
          "Use provider 'glm', 'glm-intl', 'glm-code', or 'glm-intl-code' (auto-configured) or set base_url.",
      );
    }
    super(config);
  }

  protected override _applyThinkingParams(
    kwargs: Record<string, unknown>,
    options?: import("./base.js").SendMessageOptions,
  ): void {
    if (!this._config.supportsThinking) return;
    const level = options?.thinkingLevel;
    // GLM-5.2 has high/max effort; GLM-5.3 adds low and cannot turn
    // thinking off. Older models still use the binary thinking switch.
    if (/^glm-5\.[23](?:$|-)/.test(this._config.model)) {
      const forced = this._config.model.startsWith("glm-5.3");
      if (forced || (level !== "off" && level !== "none")) {
        Object.assign(kwargs, {
          thinking: { type: "enabled", clear_thinking: false },
          reasoning_effort: forced && (level === "low" || level === "off" || level === "none") ? "low" : level === "high" ? "high" : "max",
          ...(options?.onTextChunk || options?.onReasoningChunk || options?.onToolCallPartial ? { tool_stream: true } : {}),
        });
        return;
      }
    }
    if (level === "off" || level === "none") {
      Object.assign(kwargs, {
        thinking: { type: "disabled" },
      });
      return;
    }
    Object.assign(kwargs, {
      thinking: { type: "enabled", clear_thinking: false },
    });
  }

  protected override _convertTools(
    tools: ToolDef[],
  ): { toolsList: Record<string, unknown>[]; hasNativeWebSearch: boolean } {
    const result: Record<string, unknown>[] = [];
    for (const t of tools) {
      if (t.name === "web_search") {
        if (this._config.supportsWebSearch) {
          result.push({
            type: "web_search",
            web_search: {
              enable: true,
              search_result: true,
            },
          });
          continue;
        }
        // No native support — fall through to register as a regular function tool
      }
      result.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      });
    }
    return { toolsList: result, hasNativeWebSearch: false };
  }
}
