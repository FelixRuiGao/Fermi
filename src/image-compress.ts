/**
 * Image compression / resizing.
 *
 * Implemented with `jimp` (pure JS, cross-platform). Same constraints
 * as the previous sips-based implementation:
 *   - Long edge ≤ 2000 px
 *   - File size  ≤ 4.5 MB
 *
 * Behaviour:
 *   1. Decode the buffer into a Jimp image.
 *   2. If long edge > 2000 px, downscale preserving aspect ratio.
 *   3. If the encoded result fits under 4.5 MB, return PNG; otherwise
 *      progressively re-encode as JPEG with decreasing quality.
 *   4. Last resort: return the lowest-quality JPEG even if still
 *      slightly over the limit (matches the prior sips fallback).
 */

import { Jimp } from "jimp";

const MAX_LONG_EDGE = 2000;
const MAX_SIZE_BYTES = 4.5 * 1024 * 1024; // 4.5 MB

// Quality ladder used when the PNG output is too large. Each value
// is the JPEG quality passed to `getBuffer("image/jpeg", { quality })`.
const JPEG_QUALITY_LADDER = [90, 85, 80, 70, 60];

export interface ProcessedImage {
  base64: string;
  mediaType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Process an image buffer: resize if too large, compress if too heavy.
 * Cross-platform — runs on macOS, Linux, and Windows without external
 * binaries.
 */
export async function processImage(
  inputBuffer: Buffer,
  _inputMediaType: string,
): Promise<ProcessedImage> {
  const image = await Jimp.fromBuffer(inputBuffer);

  const longEdge = Math.max(image.bitmap.width, image.bitmap.height);
  if (longEdge > MAX_LONG_EDGE) {
    if (image.bitmap.width >= image.bitmap.height) {
      image.resize({ w: MAX_LONG_EDGE });
    } else {
      image.resize({ h: MAX_LONG_EDGE });
    }
  }

  const width = image.bitmap.width;
  const height = image.bitmap.height;

  // 1. Try PNG first — lossless, fits most attachments.
  const pngBuf = await image.getBuffer("image/png");
  if (pngBuf.length <= MAX_SIZE_BYTES) {
    return {
      base64: pngBuf.toString("base64"),
      mediaType: "image/png",
      width,
      height,
      sizeBytes: pngBuf.length,
    };
  }

  // 2. PNG too large — re-encode as JPEG with decreasing quality.
  let lastJpegBuf: Buffer | null = null;
  for (const quality of JPEG_QUALITY_LADDER) {
    const buf = await image.getBuffer("image/jpeg", { quality });
    lastJpegBuf = buf;
    if (buf.length <= MAX_SIZE_BYTES) {
      return {
        base64: buf.toString("base64"),
        mediaType: "image/jpeg",
        width,
        height,
        sizeBytes: buf.length,
      };
    }
  }

  // 3. Even the lowest quality is over the limit. Return it anyway
  //    (matches the prior sips-based behaviour).
  const finalBuf = lastJpegBuf ?? pngBuf;
  return {
    base64: finalBuf.toString("base64"),
    mediaType: lastJpegBuf ? "image/jpeg" : "image/png",
    width,
    height,
    sizeBytes: finalBuf.length,
  };
}
