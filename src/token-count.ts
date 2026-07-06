/**
 * Token counting via the in-repo compact o200k_base BPE (src/compact-bpe.ts).
 *
 * Counts are bit-identical to the previous gpt-tokenizer implementation
 * (`gpt-tokenizer/model/gpt-5` with `disallowedSpecial: new Set()`): same
 * vocabulary, same split regex, special-token strings counted as plain text.
 * The swap exists because importing gpt-tokenizer costs ~150-200MB RSS (Bun
 * permanently retains its ~200k-string vocabulary module), while the compact
 * table holds the same data in ~8MB. Parity is locked by
 * tests/token-count-parity.test.ts against gpt-tokenizer (devDependency).
 *
 * Special-token substrings (e.g. Qwen's `<|im_start|>` / `<|im_end|>`
 * chat-template markers leaking in via shell output or read files) are always
 * counted as ordinary text — counting is an estimate and must never throw on
 * arbitrary conversation content.
 */
import o200kVocabB64 from "./assets/o200k-base.b64.txt" with { type: "text" };

import { CompactBpe, decodeVocabBlob } from "./compact-bpe.js";

let bpe: CompactBpe | null = null;

/** Estimate the o200k token count of `text`, never throwing on special-token substrings. */
export function countTokens(text: string): number {
  if (!bpe) bpe = new CompactBpe(decodeVocabBlob(o200kVocabB64));
  return bpe.count(text);
}
