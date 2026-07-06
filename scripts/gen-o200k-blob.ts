/**
 * Generate the compact o200k_base vocabulary blob for src/compact-bpe.ts.
 *
 * Reads the BPE rank table from gpt-tokenizer (devDependency; its data is
 * generated from tiktoken's official o200k_base.tiktoken) and re-encodes it
 * as a binary blob, then writes it base64-encoded to
 * src/assets/o200k-base.b64.txt (committed; embedded via Bun text import).
 *
 * Blob layout (little-endian):
 *   bytes 0..4    magic "O2K1"
 *   bytes 4..8    u32 token count N (rank = array index)
 *   bytes 8..     u32 offsets[N+1] into the bytes section
 *   after         concatenated token bytes
 *
 * Run: bun scripts/gen-o200k-blob.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const { default: bpe } = (await import("gpt-tokenizer/esm/bpeRanks/o200k_base.js")) as {
  default: (string | number[])[];
};

const encoder = new TextEncoder();
const tokenBytes: Uint8Array[] = bpe.map((entry) =>
  typeof entry === "string" ? encoder.encode(entry) : Uint8Array.from(entry),
);

const count = tokenBytes.length;
const totalBytes = tokenBytes.reduce((sum, b) => sum + b.length, 0);
const headerSize = 8 + 4 * (count + 1);
const blob = new Uint8Array(headerSize + totalBytes);
const view = new DataView(blob.buffer);

blob.set(encoder.encode("O2K1"), 0);
view.setUint32(4, count, true);

let cursor = 0;
for (let rank = 0; rank < count; rank++) {
  view.setUint32(8 + 4 * rank, cursor, true);
  blob.set(tokenBytes[rank]!, headerSize + cursor);
  cursor += tokenBytes[rank]!.length;
}
view.setUint32(8 + 4 * count, cursor, true);

const outDir = join(repoRoot, "src", "assets");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "o200k-base.b64.txt");
writeFileSync(outPath, Buffer.from(blob).toString("base64"));

console.log(
  `wrote ${outPath}: ${count} tokens, blob ${(blob.length / 1048576).toFixed(2)}MB, ` +
    `base64 ${((blob.length * 4) / 3 / 1048576).toFixed(2)}MB`,
);
