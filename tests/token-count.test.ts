import { describe, expect, it } from "bun:test";

import { countTokens } from "../src/token-count.js";
import { estimateEntryTokens, generateShowContext } from "../src/show-context.js";
import { createToolResult, createUserMessage, type LogEntry } from "../src/log-entry.js";

// Regression: gpt-tokenizer's default `disallowedSpecial: 'all'` throws
// "Disallowed special token found" when the text contains a literal
// special-token string (e.g. Qwen chat-template markers leaking through
// shell output / read files). That crashed show_context and the usage-stat
// estimates. countTokens must treat such substrings as ordinary text.
const SPECIAL_STRINGS = ["<|im_start|>", "<|im_end|>", "<|endoftext|>"];

describe("countTokens", () => {
  it("does not throw on literal special-token strings", () => {
    for (const s of SPECIAL_STRINGS) {
      expect(() => countTokens(`hello ${s} world`)).not.toThrow();
      expect(countTokens(`hello ${s} world`)).toBeGreaterThan(0);
    }
  });

  it("counts a special-token marker as plain text (multiple tokens, not 1)", () => {
    // Encoded as ordinary text rather than a single special-token id.
    expect(countTokens("<|im_start|>")).toBeGreaterThan(1);
  });
});

describe("show_context token estimation with special tokens", () => {
  it("estimateEntryTokens survives a tool_result containing <|im_start|>", () => {
    const entry = createToolResult("tr-1", 1, 0, {
      toolCallId: "call-1",
      toolName: "bash",
      content: "role: <|im_start|>user\nhi<|im_end|>\n",
      toolSummary: "ran qwen autotune",
    }, { isError: false, contextId: "c1" });
    expect(() => estimateEntryTokens(entry)).not.toThrow();
    expect(estimateEntryTokens(entry)).toBeGreaterThan(0);
  });

  it("generateShowContext does not crash on a log with special-token content", () => {
    const entries: LogEntry[] = [
      createUserMessage("user-1", 1, "<|im_start|>", "<|im_start|>", "c1"),
      createToolResult("tr-1", 1, 0, {
        toolCallId: "call-1",
        toolName: "read_file",
        content: "<|im_start|>system\nyou are<|im_end|>",
        toolSummary: "read template",
      }, { isError: false, contextId: "c1" }),
    ];
    expect(() => generateShowContext(entries, 1000, 200_000)).not.toThrow();
  });
});
