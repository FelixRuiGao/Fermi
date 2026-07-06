/**
 * Compact o200k_base BPE token counter.
 *
 * Drop-in replacement for gpt-tokenizer's `encode(text).length` that keeps the
 * whole vocabulary in typed arrays instead of ~200k JS string literals. The
 * gpt-tokenizer module costs ~150-200MB RSS just to import (Bun retains the
 * parsed module with one AST/heap node per token string); this implementation
 * holds the same table in ~8MB (2.1MB vocab blob + a Uint32Array hash index).
 *
 * Counts are bit-identical to gpt-tokenizer's `gpt-5` model encoding with
 * `disallowedSpecial: new Set()` (special tokens treated as plain text —
 * exactly how src/token-count.ts always called it). Parity is locked by
 * tests/token-count-parity.test.ts against gpt-tokenizer (devDependency).
 *
 * Algorithm: tiktoken's `encode_ordinary` — split text with the o200k regex,
 * look each piece up in the vocab (single token if present), otherwise run
 * the standard byte-pair merge over the piece's UTF-8 bytes and count the
 * remaining parts.
 */

/**
 * o200k_base pre-tokenization pattern. Copied verbatim from gpt-tokenizer
 * `esm/encodingParams/constants.js` (O200K_TOKEN_SPLIT_PATTERN), which mirrors
 * tiktoken's official o200k_base pattern. Must not drift: parity tests compare
 * counts against gpt-tokenizer directly.
 */
const CONTRACTION = "'(?:[sS]|[dD]|[mM]|[tT]|[lL][lL]|[vV][eE]|[rR][eE])";
const O200K_SPLIT_PATTERN =
  `[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+(?:${CONTRACTION})?` +
  `|[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*(?:${CONTRACTION})?` +
  `|\\p{N}{1,3}` +
  `| ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*` +
  `|\\s*[\\r\\n]+` +
  `|\\s+(?!\\S)` +
  `|\\s+`;

const EMPTY_SLOT = 0;
const MAX_RANK = 0x7fffffff;

export class CompactBpe {
  private readonly _tokenBytes: Uint8Array;
  private readonly _offsets: Uint32Array;
  /** Open-addressing hash table; slot value = rank + 1, 0 = empty. */
  private readonly _table: Uint32Array;
  private readonly _mask: number;
  private readonly _splitRegex = new RegExp(O200K_SPLIT_PATTERN, "gu");
  private readonly _textEncoder = new TextEncoder();
  /** Reusable UTF-8 scratch buffer for regex pieces. */
  private _scratch = new Uint8Array(1024);

  constructor(blob: Uint8Array) {
    if (
      blob[0] !== 0x4f || // O
      blob[1] !== 0x32 || // 2
      blob[2] !== 0x4b || // K
      blob[3] !== 0x31 // 1
    ) {
      throw new Error("compact-bpe: bad vocabulary blob magic");
    }
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    const count = view.getUint32(4, true);
    const headerSize = 8 + 4 * (count + 1);
    // Uint32Array requires 4-byte alignment; re-copy if the blob isn't aligned.
    const aligned = (blob.byteOffset + 8) % 4 === 0 ? blob : blob.slice();
    this._offsets = new Uint32Array(aligned.buffer, aligned.byteOffset + 8, count + 1);
    this._tokenBytes = aligned.subarray(headerSize);

    let cap = 1;
    while (cap < count * 2) cap <<= 1;
    this._mask = cap - 1;
    this._table = new Uint32Array(cap);
    for (let rank = 0; rank < count; rank++) {
      const start = this._offsets[rank]!;
      const end = this._offsets[rank + 1]!;
      let slot = this._hash(this._tokenBytes, start, end) & this._mask;
      while (this._table[slot] !== EMPTY_SLOT) slot = (slot + 1) & this._mask;
      this._table[slot] = rank + 1;
    }
  }

  /** Count BPE tokens in `text`. Special-token strings count as plain text. */
  count(text: string): number {
    if (text.length === 0) return 0;
    const regex = this._splitRegex;
    regex.lastIndex = 0;
    let total = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const piece = match[0];
      if (piece.length === 0) continue; // safety: never stall the loop
      total += this._countPiece(piece);
    }
    return total;
  }

  private _countPiece(piece: string): number {
    // Encode into the reusable scratch buffer (grow on demand).
    if (this._scratch.length < piece.length * 3) {
      this._scratch = new Uint8Array(Math.max(piece.length * 3, this._scratch.length * 2));
    }
    const { written } = this._textEncoder.encodeInto(piece, this._scratch);
    const bytes = this._scratch;
    const len = written;

    if (len === 1) return 1; // every single byte is in the vocabulary
    if (this._rankOf(bytes, 0, len) >= 0) return 1;
    return this._bytePairMergeCount(bytes, len);
  }

  /**
   * tiktoken's byte_pair_merge, counting the surviving parts. `parts[i]` is a
   * boundary offset; `ranks[i]` is the rank of merging the pair that starts at
   * parts[i] (i.e. bytes[parts[i] .. parts[i+2]]), MAX_RANK when unmergeable.
   */
  private _bytePairMergeCount(bytes: Uint8Array, len: number): number {
    let n = len + 1; // number of boundaries
    const parts = new Int32Array(n);
    const ranks = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      parts[i] = i;
      ranks[i] =
        i + 2 <= len ? this._rankOrMax(bytes, i, i + 2) : MAX_RANK;
    }

    while (true) {
      let minRank = MAX_RANK;
      let minIdx = -1;
      for (let i = 0; i < n - 1; i++) {
        if (ranks[i]! < minRank) {
          minRank = ranks[i]!;
          minIdx = i;
        }
      }
      if (minIdx < 0 || minRank === MAX_RANK) break;

      // Merge the pair starting at minIdx: drop boundary minIdx+1.
      parts.copyWithin(minIdx + 1, minIdx + 2, n);
      ranks.copyWithin(minIdx + 1, minIdx + 2, n);
      n--;

      // Recompute the pair ranks that changed: at minIdx-1 and minIdx.
      if (minIdx > 0) {
        ranks[minIdx - 1] =
          minIdx + 1 < n
            ? this._rankOrMax(bytes, parts[minIdx - 1]!, parts[minIdx + 1]!)
            : MAX_RANK;
      }
      ranks[minIdx] =
        minIdx + 2 < n
          ? this._rankOrMax(bytes, parts[minIdx]!, parts[minIdx + 2]!)
          : MAX_RANK;
    }

    return n - 1;
  }

  private _rankOrMax(bytes: Uint8Array, start: number, end: number): number {
    const rank = this._rankOf(bytes, start, end);
    return rank >= 0 ? rank : MAX_RANK;
  }

  /** Look up the rank of bytes[start..end], or -1 when absent. */
  private _rankOf(bytes: Uint8Array, start: number, end: number): number {
    const table = this._table;
    const mask = this._mask;
    let slot = this._hash(bytes, start, end) & mask;
    const offsets = this._offsets;
    const tokenBytes = this._tokenBytes;
    const keyLen = end - start;
    while (true) {
      const stored = table[slot]!;
      if (stored === EMPTY_SLOT) return -1;
      const rank = stored - 1;
      const tokStart = offsets[rank]!;
      if (offsets[rank + 1]! - tokStart === keyLen) {
        let i = 0;
        while (i < keyLen && tokenBytes[tokStart + i] === bytes[start + i]) i++;
        if (i === keyLen) return rank;
      }
      slot = (slot + 1) & mask;
    }
  }

  /** FNV-1a over bytes[start..end). */
  private _hash(bytes: Uint8Array, start: number, end: number): number {
    let h = 0x811c9dc5;
    for (let i = start; i < end; i++) {
      h ^= bytes[i]!;
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}

/** Decode the base64-embedded vocabulary blob (see scripts/gen-o200k-blob.ts). */
export function decodeVocabBlob(b64: string): Uint8Array {
  // Zero-copy view — never `Uint8Array.from(buffer)`: element-wise iteration
  // over ~2.2M entries permanently inflates the JSC heap watermark by ~85MB.
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
