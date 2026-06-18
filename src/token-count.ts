/**
 * Token counting via gpt-tokenizer (gpt-5 / o200k_base vocab).
 *
 * Always disables the disallowed-special-token guard. Callers count arbitrary
 * conversation / tool-result / file content that may contain literal
 * special-token strings — e.g. Qwen's `<|im_start|>` / `<|im_end|>`
 * chat-template markers leaking in through shell output or read files. With
 * gpt-tokenizer's default (`disallowedSpecial: 'all'`) such substrings throw
 * `Disallowed special token found`, which previously crashed show_context and
 * the usage-stat estimates. Here we encode them as ordinary text so counting
 * is robust; the count is an estimate, so treating the markers as plain text
 * (rather than single special-token ids) is the faithful choice anyway.
 */
import { encode as gptEncode } from "gpt-tokenizer/model/gpt-5";

const COUNT_OPTS = { disallowedSpecial: new Set<string>() };

/** Estimate the gpt-tokenizer token count of `text`, never throwing on special-token substrings. */
export function countTokens(text: string): number {
  return gptEncode(text, COUNT_OPTS).length;
}
