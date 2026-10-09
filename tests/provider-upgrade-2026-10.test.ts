import { describe, expect, it, mock } from "bun:test";
import type { ModelConfig } from "../src/config.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { KimiAnthropicProvider } from "../src/providers/kimi-anthropic.js";
import { MiniMaxAnthropicProvider } from "../src/providers/minimax-anthropic.js";
import { DeepSeekAnthropicProvider } from "../src/providers/deepseek-anthropic.js";
import { GLMProvider } from "../src/providers/glm.js";
import { CopilotProvider } from "../src/providers/copilot.js";
import { QwenResponsesProvider } from "../src/providers/qwen-responses.js";
import { OpenAIResponsesProvider } from "../src/providers/openai-responses.js";
import type { BaseProvider, SendMessageOptions, ToolDef } from "../src/providers/base.js";
import { resolveTransportProtocol, resolveSealedSchema } from "../src/thinking-artifact.js";
import { FACTORY_MODEL_SPECS, FACTORY_PROVIDER_SPECS } from "../src/model-registry.js";
import { loadRemoteRegistry } from "../src/registry-effective.js";
import OpenAI from "openai";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

function config(model: string, provider = "anthropic", extra: Record<string, unknown> = {}): ModelConfig {
  return {
    name: "upgrade-test", provider, model, apiKey: "test", baseUrl: "https://example.test/v1",
    temperature: 0.7, maxTokens: 32000, contextLength: 1000000,
    supportsMultimodal: true, supportsThinking: true, supportsWebSearch: false,
    thinkingBudget: 0, extra,
  };
}

const TOOL: ToolDef = {
  name: "edit_file", description: "Edit a file",
  parameters: { type: "object", properties: { edits: { type: "array", items: { type: "object", properties: { old_str: { type: "string" } }, required: ["old_str"] } } }, required: ["edits"] },
};

async function request(provider: BaseProvider, options: SendMessageOptions = {}, tools?: ToolDef[]): Promise<Record<string, unknown>> {
  const response = { id: "reply", content: [{ type: "text", text: "ok" }], output: [], choices: [{ message: { content: "ok" } }], usage: {} };
  const create = mock(async (params: Record<string, unknown>) => params.stream
    ? (async function* () { yield { type: "response.completed", response }; })()
    : response);
  (provider as any)._client = { messages: { create }, responses: { create }, chat: { completions: { create } } };
  await provider.sendMessage([{ role: "user", content: "hi" }], tools, options);
  return create.mock.calls[0]![0] as Record<string, unknown>;
}

describe("October 2026 provider migration contracts", () => {
  it.each(["claude-opus-4-8", "claude-opus-4.8-fast", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"])("uses adaptive thinking and native effort for %s", async model => {
    const body = await request(new AnthropicProvider(config(model)), { thinkingLevel: "max" }, [TOOL]);
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "max" });
    expect(body.temperature).toBeUndefined();
    expect((body.tools as any[])[0].input_schema).toEqual(TOOL.parameters);
  });

  it("keeps Haiku's disabled setting valid and never disables Opus 5.5", async () => {
    const haiku = await request(new AnthropicProvider(config("claude-haiku-5-5")), { thinkingLevel: "off" });
    expect(haiku.thinking).toEqual({ type: "disabled" });
    expect(haiku.output_config).toEqual({ effort: "low" });
    const opus = await request(new AnthropicProvider(config("claude-opus-5-5")), { thinkingLevel: "off" });
    expect(opus.thinking).toEqual({ type: "adaptive" });
    expect(opus.output_config).toEqual({ effort: "low" });
  });

  it.each(["gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"])("preserves max effort and removes incompatible fields for %s", async model => {
    const body = await request(new OpenAIResponsesProvider(config(model, "openai", {
      temperature: 0.5, top_p: 0.9, top_logprobs: 2, include: ["message.output_text.logprobs"], prompt_cache_retention: "24h",
    })), { thinkingLevel: "max" }, [TOOL]);
    expect(body.reasoning).toEqual({ effort: "max", summary: "auto" });
    for (const key of ["temperature", "top_p", "top_logprobs", "prompt_cache_retention"]) expect(body[key]).toBeUndefined();
    expect(body.include).not.toContain("message.output_text.logprobs");
    expect(body.prompt_cache_options).toEqual({ ttl: "30m" });
    expect((body.tools as any[])[0].parameters).toEqual(TOOL.parameters);
  });

  it("does not send none to Astra or 6.1 Sol", async () => {
    const body = await request(new OpenAIResponsesProvider(config("gpt-6.1-sol", "openai")), { thinkingLevel: "off" });
    expect(body.reasoning).toEqual({ effort: "low", summary: "auto" });
  });

  it("maps Qwen 3.8 effort without the deprecated switch or thinking_budget", async () => {
    const body = await request(new QwenResponsesProvider(config("qwen3.8-max", "qwen")), { thinkingLevel: "medium" }, [TOOL]);
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.enable_thinking).toBeUndefined();
    expect(body.thinking_budget).toBeUndefined();
    expect(body.max_output_tokens).toBe(32000);
    const only = await request(new QwenResponsesProvider(config("qwen3.8-2.4t-a95b", "qwen")), { thinkingLevel: "off" });
    expect(only.reasoning).toEqual({ effort: "xhigh" });
  });

  it("keeps K3's public and Coding thinking/cache contracts distinct", async () => {
    const api = await request(new KimiAnthropicProvider(config("kimi-k3", "kimi")), { thinkingLevel: "low" });
    expect(api.thinking).toBeUndefined();
    expect(api.output_config).toEqual({ effort: "low" });
    expect(api.cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
    expect(api.temperature).toBeUndefined();
    const coding = await request(new KimiAnthropicProvider(config("kimi-for-coding", "kimi-code")), { thinkingLevel: "off" });
    expect(coding.thinking).toEqual({ type: "disabled" });
    expect(coding.output_config).toBeUndefined();
    expect(coding.cache_control).toBeUndefined();
  });

  it("uses MiniMax adaptive thinking, preview effort, and updated sampling range", async () => {
    const m3 = await request(new MiniMaxAnthropicProvider({ ...config("MiniMax-M3", "minimax"), temperature: 1 }), { thinkingLevel: "on" });
    expect(m3.thinking).toEqual({ type: "adaptive" });
    expect(m3.temperature).toBe(1);
    const preview = await request(new MiniMaxAnthropicProvider(config("MiniMax-M3.1-Flash-Preview", "minimax")), { thinkingLevel: "xhigh" });
    expect(preview.output_config).toEqual({ effort: "xhigh" });
    expect(preview.thinking).toEqual({ type: "adaptive" });
  });

  it("sends GLM-5.3 low effort with preserved thinking", async () => {
    const body = await request(new GLMProvider(config("glm-5.3-flash", "glm-code")), { thinkingLevel: "low" }, [TOOL]);
    expect(body.thinking).toEqual({ type: "enabled", clear_thinking: false });
    expect(body.reasoning_effort).toBe("low");
    expect(body.extra_body).toBeUndefined();
  });

  it("serializes vendor extensions at the wire's top level through the real Node SDK", async () => {
    for (const provider of [new GLMProvider(config("glm-5.3", "glm")), new OpenRouterProvider(config("openai/gpt-6-astra", "openrouter"))]) {
      let wire: Record<string, unknown> = {};
      (provider as any)._client = new OpenAI({
        apiKey: "test", baseURL: "https://example.test/v1", maxRetries: 0,
        fetch: async (_input, init) => {
          wire = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: {} }), { headers: { "content-type": "application/json" } });
        },
      });
      await provider.sendMessage([{ role: "user", content: "test" }], [TOOL], { thinkingLevel: "max" });
      expect(wire.extra_body).toBeUndefined();
      if (provider instanceof GLMProvider) {
        expect(wire.reasoning_effort).toBe("max");
        expect(wire.thinking).toEqual({ type: "enabled", clear_thinking: false });
      } else {
        expect(wire.reasoning).toEqual({ effort: "max" });
      }
    }
  });

  it("preserves DeepSeek's new low effort", async () => {
    const body = await request(new DeepSeekAnthropicProvider(config("deepseek-flash", "deepseek")), { thinkingLevel: "low" });
    expect(body.output_config).toEqual({ effort: "low" });
  });

  it.each(["gemini-3.8-flash", "kimi-k3"])("routes Copilot %s through Chat with plain reasoning replay", async model => {
    const provider = new CopilotProvider(config(model, "copilot"));
    expect(resolveTransportProtocol("copilot", model)).toBe("chat");
    expect(resolveSealedSchema("copilot", model)).toBeNull();
    // Inspect the real selected transport without requesting OAuth/network access.
    const inner = (provider as any)._inner;
    inner._refreshClient = mock(async () => {});
    const body = await request(inner, { thinkingLevel: "low" }, [TOOL]);
    expect(body.reasoning_effort).toBe("low");
    expect((body.tools as any[])[0].function.parameters).toEqual(TOOL.parameters);
    expect(body.input).toBeUndefined();
  });

  it("gates models requiring new adapters out of remote registries for older binaries", () => {
    const raw = { models: { schemaVersion: 1, models: FACTORY_MODEL_SPECS }, providers: { schemaVersion: 1, providers: FACTORY_PROVIDER_SPECS } };
    const older = loadRemoteRegistry(raw, "0.4.1");
    expect(older.models.some(m => m.id === "gpt-6-astra")).toBe(false);
    expect(older.models.some(m => m.id === "gpt-5.4")).toBe(true);
    const current = loadRemoteRegistry(raw, "0.4.2");
    expect(current.models.some(m => m.id === "gpt-6-astra")).toBe(true);
  });
});
