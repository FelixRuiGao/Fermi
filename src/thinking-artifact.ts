/**
 * Thinking history is tracked on two independent axes:
 *   1. transport protocol (responses / anthropic / chat)
 *   2. reasoning encryption family (openai / anthropic / none)
 *
 * Provider implementations are responsible for protocol encoding. Model
 * switching decides what to send by comparing the stored artifact's
 * encryption family with the target model's family.
 */

export type TransportProtocol = "responses" | "anthropic" | "chat";
export type ThinkingEncryption = "openai" | "anthropic" | "none";

export type ThinkingArtifact =
  | {
      encryption: "none";
      plainReplayText: string;
    }
  | {
      encryption: "openai" | "anthropic";
      plainReplayText: string;
      sealedPayload: unknown | null;
    };

export type ThinkingTransmission =
  | { kind: "sealed"; artifact: ThinkingArtifact; payload: unknown }
  | { kind: "plain"; artifact: ThinkingArtifact; plainReplayText: string }
  | { kind: "omit"; artifact: ThinkingArtifact };

export function createThinkingArtifact(
  encryption: ThinkingEncryption,
  plainReplayText: string,
  sealedPayload?: unknown,
): ThinkingArtifact {
  const trimmed = plainReplayText.trim();
  if (encryption === "none") {
    return {
      encryption,
      plainReplayText: trimmed,
    };
  }
  return {
    encryption,
    plainReplayText: trimmed,
    sealedPayload: sealedPayload ?? null,
  };
}

function hasSealedPayload(artifact: ThinkingArtifact): artifact is Extract<ThinkingArtifact, { sealedPayload: unknown | null }> {
  return artifact.encryption !== "none" && artifact.sealedPayload !== null;
}

export function isThinkingArtifact(value: unknown): value is ThinkingArtifact {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  const encryption = raw["encryption"];
  const plainReplayText = raw["plainReplayText"];
  if ((encryption !== "openai" && encryption !== "anthropic" && encryption !== "none") || typeof plainReplayText !== "string") {
    return false;
  }
  if (encryption === "none") {
    return !("sealedPayload" in raw);
  }
  return "sealedPayload" in raw;
}

export function normalizeThinkingArtifact(value: unknown): ThinkingArtifact | null {
  if (!isThinkingArtifact(value)) return null;
  const raw = value as unknown as Record<string, unknown>;
  return createThinkingArtifact(
    raw["encryption"] as ThinkingEncryption,
    raw["plainReplayText"] as string,
    raw["sealedPayload"],
  );
}

export function isOpenAIEncryptedPayload(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const type = (item as Record<string, unknown>)["type"];
    return type === "reasoning" || type === "function_call";
  });
}

export function isAnthropicEncryptedPayload(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const type = (item as Record<string, unknown>)["type"];
    return type === "thinking" || type === "redacted_thinking";
  });
}

export function inferThinkingArtifact(
  plainReplayText: unknown,
  reasoningState: unknown,
): ThinkingArtifact | null {
  const replayText = typeof plainReplayText === "string" ? plainReplayText.trim() : "";

  if (isThinkingArtifact(reasoningState)) {
    const artifact = normalizeThinkingArtifact(reasoningState);
    if (artifact) return artifact;
  }

  if (isOpenAIEncryptedPayload(reasoningState)) {
    return createThinkingArtifact("openai", replayText, reasoningState);
  }

  if (isAnthropicEncryptedPayload(reasoningState)) {
    return createThinkingArtifact("anthropic", replayText, reasoningState);
  }

  if (replayText || reasoningState !== undefined && reasoningState !== null) {
    return createThinkingArtifact("none", replayText);
  }

  return null;
}

export function resolveMessageThinkingArtifact(
  message: Record<string, unknown>,
): ThinkingArtifact | null {
  const raw = message["_thinking_artifact"];
  const normalized = normalizeThinkingArtifact(raw);
  if (normalized) return normalized;
  return inferThinkingArtifact(
    message["reasoning_content"],
    message["_reasoning_state"],
  );
}

export function selectThinkingTransmission(
  artifact: ThinkingArtifact | null | undefined,
  targetEncryption: ThinkingEncryption,
): ThinkingTransmission | null {
  if (!artifact) return null;

  const replayText = artifact.plainReplayText.trim();

  if (targetEncryption !== "none" && artifact.encryption === targetEncryption && hasSealedPayload(artifact)) {
    return {
      kind: "sealed",
      artifact,
      payload: artifact.sealedPayload,
    };
  }

  if (targetEncryption === "none" && replayText) {
    return {
      kind: "plain",
      artifact,
      plainReplayText: replayText,
    };
  }

  return {
    kind: "omit",
    artifact,
  };
}

export function buildAnthropicPlainThinkingPayload(plainReplayText: string): Record<string, unknown>[] {
  const trimmed = plainReplayText.trim();
  if (!trimmed) return [];
  return [{
    type: "thinking",
    thinking: trimmed,
  }];
}

function stripVendorPrefix(model: string): string {
  const idx = model.lastIndexOf("/");
  return idx >= 0 ? model.slice(idx + 1) : model;
}

export function isAnthropicFamilyModel(model: string): boolean {
  return stripVendorPrefix(model).toLowerCase().startsWith("claude-");
}

export function isOpenAIFamilyModel(model: string): boolean {
  const normalized = stripVendorPrefix(model).toLowerCase();
  return normalized.startsWith("gpt-") || /^o\d/.test(normalized);
}

export function resolveTransportProtocol(
  provider: string,
  model: string,
): TransportProtocol {
  const id = provider.toLowerCase();

  if (id === "openai" || id === "openai-codex") return "responses";
  if (id === "anthropic") return "anthropic";
  if (id === "copilot") {
    return isAnthropicFamilyModel(model) ? "anthropic" : "responses";
  }
  if (
    id === "kimi" || id === "kimi-cn" || id === "kimi-ai" || id === "kimi-code"
    || id === "deepseek"
    || id === "minimax" || id === "minimax-cn"
    || id === "xiaomi"
  ) {
    return "anthropic";
  }
  return "chat";
}

export function resolveThinkingEncryption(
  provider: string,
  model: string,
): ThinkingEncryption {
  const id = provider.toLowerCase();

  if (id === "openai" || id === "openai-codex") return "openai";
  if (id === "anthropic") return "anthropic";
  if (id === "copilot" || id === "openrouter") {
    if (isOpenAIFamilyModel(model)) return "openai";
    if (isAnthropicFamilyModel(model)) return "anthropic";
    return "none";
  }
  return "none";
}

export function effectiveTransportProtocol(config: {
  provider: string;
  model: string;
  transportProtocol?: TransportProtocol;
}): TransportProtocol {
  return config.transportProtocol ?? resolveTransportProtocol(config.provider, config.model);
}

export function effectiveThinkingEncryption(config: {
  provider: string;
  model: string;
  thinkingEncryption?: ThinkingEncryption;
}): ThinkingEncryption {
  return config.thinkingEncryption ?? resolveThinkingEncryption(config.provider, config.model);
}
