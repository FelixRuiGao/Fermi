import { describe, expect, it } from "bun:test";

import {
  createThinkingArtifact,
  effectiveThinkingEncryption,
  effectiveTransportProtocol,
  selectThinkingTransmission,
} from "../src/thinking-artifact.js";

describe("thinking artifact selection", () => {
  it("keeps sealed payloads only within the same encryption family", () => {
    const openai = createThinkingArtifact("openai", "openai summary", [{ type: "reasoning", encrypted_content: "enc" }]);
    const anthropic = createThinkingArtifact("anthropic", "anthropic summary", [{ type: "thinking", thinking: "hidden", signature: "sig" }]);

    expect(selectThinkingTransmission(openai, "openai")?.kind).toBe("sealed");
    expect(selectThinkingTransmission(openai, "anthropic")?.kind).toBe("omit");
    expect(selectThinkingTransmission(anthropic, "anthropic")?.kind).toBe("sealed");
    expect(selectThinkingTransmission(anthropic, "openai")?.kind).toBe("omit");
  });

  it("replays plain text only when targeting non-encrypted models", () => {
    const openai = createThinkingArtifact("openai", "openai summary", [{ type: "reasoning", encrypted_content: "enc" }]);
    const anthropic = createThinkingArtifact("anthropic", "anthropic summary", [{ type: "thinking", thinking: "hidden", signature: "sig" }]);
    const plain = createThinkingArtifact("none", "plain summary");

    const fromOpenAi = selectThinkingTransmission(openai, "none");
    const fromAnthropic = selectThinkingTransmission(anthropic, "none");
    const fromPlainToOpenAi = selectThinkingTransmission(plain, "openai");
    const fromPlainToAnthropic = selectThinkingTransmission(plain, "anthropic");
    const fromPlainToPlain = selectThinkingTransmission(plain, "none");

    expect(fromOpenAi?.kind).toBe("plain");
    expect(fromAnthropic?.kind).toBe("plain");
    expect(fromPlainToOpenAi?.kind).toBe("omit");
    expect(fromPlainToAnthropic?.kind).toBe("omit");
    expect(fromPlainToPlain?.kind).toBe("plain");
  });

  it("omits encrypted-family replay when the matching sealed payload is missing", () => {
    const artifact = createThinkingArtifact("openai", "summary only");
    const selected = selectThinkingTransmission(artifact, "openai");
    expect(selected?.kind).toBe("omit");
  });

  it("never treats non-encrypted artifacts as sealed even if a caller passes payload", () => {
    const artifact = createThinkingArtifact("none", "plain replay", [{ type: "legacy" }]);
    const selected = selectThinkingTransmission(artifact, "none");
    expect(selected?.kind).toBe("plain");
    expect(artifact.sealedPayload).toBeUndefined();
  });
});

describe("transport and encryption classification", () => {
  it("keeps protocol and encryption independent", () => {
    expect(effectiveTransportProtocol({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.6",
    })).toBe("chat");
    expect(effectiveThinkingEncryption({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.6",
    })).toBe("anthropic");

    expect(effectiveTransportProtocol({
      provider: "openrouter",
      model: "openai/gpt-5.4",
    })).toBe("chat");
    expect(effectiveThinkingEncryption({
      provider: "openrouter",
      model: "openai/gpt-5.4",
    })).toBe("openai");

    expect(effectiveTransportProtocol({
      provider: "kimi",
      model: "kimi-k2.5",
    })).toBe("anthropic");
    expect(effectiveThinkingEncryption({
      provider: "kimi",
      model: "kimi-k2.5",
    })).toBe("none");
  });
});
