/**
 * Pure logic for transcript windowing (virtualized conversation stream).
 *
 * The presentation panel mounts real entry components only for a window of
 * entries around the viewport; everything else renders as a fixed-height
 * placeholder box. Heights start as cheap estimates and are corrected to the
 * real layout height the first time an entry is mounted (scroll anchoring in
 * the panel keeps the visible content stable when a correction lands).
 *
 * Why this exists: without windowing, restoring a long session materializes
 * every entry — markdown parse trees, syntax highlighting, StyledText chunks,
 * native text buffers and yoga nodes for thousands of renderables. Measured
 * on a 4.4MB session log this cost ~430MB RSS that allocators never return
 * to the OS, even after the renderables are destroyed. Never materializing
 * offscreen entries is the only cure (see presentation-panel.tsx).
 */

import type { PresentationEntry } from "../../presentation/types.js";

export interface MountWindow {
  start: number;
  end: number;
  /** True when the window reached the last entry at compute time — the panel
   * then keeps following appended entries until the next recompute. */
  atTail: boolean;
}

/** Rows kept materialized beyond each edge of the viewport. */
export const MOUNT_MARGIN_ROWS = 15;
/** Extra rows mounted past the margin when the window is rebuilt, so small
 * scrolls don't rebuild it every frame (hysteresis, mount side). */
export const MOUNT_CHUNK_ROWS = 40;
/** A mounted entry is only parked again once it sits this many rows outside
 * the viewport (hysteresis, park side). Must exceed MOUNT_MARGIN + CHUNK. */
export const PARK_SLACK_ROWS = 120;

/** Entries in short transcripts are always fully mounted. */
export const MIN_VIRTUALIZE_COUNT = 60;

interface HeightRecord {
  rows: number;
  measured: boolean;
  version: number;
  width: number;
}

/**
 * Height bookkeeping for transcript entries. Estimates until measured;
 * measurements are demoted back to estimates when the rendering context
 * (width, markdown/diff mode, theme) changes.
 */
export class TranscriptHeightModel {
  private _records = new Map<string, HeightRecord>();

  heightFor(entry: PresentationEntry, contentWidth: number): number {
    const rec = this._records.get(entry.id);
    if (rec) return rec.rows;
    const rows = estimateEntryRows(entry, contentWidth);
    this._records.set(entry.id, {
      rows,
      measured: false,
      version: entry.contentVersion,
      width: contentWidth,
    });
    return rows;
  }

  /**
   * Record a real layout measurement. Returns the height delta (new - old)
   * so the caller can anchor the scroll position.
   */
  recordMeasurement(entry: PresentationEntry, contentWidth: number, rows: number): number {
    const rec = this._records.get(entry.id);
    const previous = rec?.rows ?? estimateEntryRows(entry, contentWidth);
    if (
      rec
      && rec.measured
      && rec.rows === rows
      && rec.version === entry.contentVersion
      && rec.width === contentWidth
    ) {
      return 0;
    }
    this._records.set(entry.id, {
      rows,
      measured: true,
      version: entry.contentVersion,
      width: contentWidth,
    });
    return rows - previous;
  }

  /** Demote all measurements to estimates (kept as best-known heights). */
  demoteMeasurements(): void {
    for (const rec of this._records.values()) rec.measured = false;
  }

  /** Forget everything (e.g. transcript source switched to another session). */
  clear(): void {
    this._records.clear();
  }

  /** Drop records whose entries no longer exist (rewind, source switch). */
  prune(liveIds: ReadonlySet<string>): void {
    for (const id of this._records.keys()) {
      if (!liveIds.has(id)) this._records.delete(id);
    }
  }
}

/**
 * Prefix sums of entry heights: result[i] = rows above entry i; result[N] =
 * total rows. `topOffset` accounts for fixed content above the first entry.
 */
export function buildPrefixTops(
  items: readonly PresentationEntry[],
  model: TranscriptHeightModel,
  contentWidth: number,
  topOffset: number,
): number[] {
  const tops = new Array<number>(items.length + 1);
  let acc = topOffset;
  for (let i = 0; i < items.length; i++) {
    tops[i] = acc;
    acc += model.heightFor(items[i]!, contentWidth);
  }
  tops[items.length] = acc;
  return tops;
}

/**
 * Compute the entry window to keep mounted for the current scroll position.
 * Returns `prev` (same identity) when it still covers the desired range and
 * isn't excessively larger, so callers can skip re-rendering.
 */
export function computeMountWindow(args: {
  tops: readonly number[];
  scrollTop: number;
  viewportHeight: number;
  prev: MountWindow | null;
}): MountWindow {
  const { tops, scrollTop, viewportHeight, prev } = args;
  const count = tops.length - 1;
  if (count <= 0) return { start: 0, end: -1, atTail: true };

  const wantTop = scrollTop - MOUNT_MARGIN_ROWS;
  const wantBottom = scrollTop + viewportHeight + MOUNT_MARGIN_ROWS;

  const desiredStart = indexAtRow(tops, wantTop);
  const desiredEnd = indexAtRow(tops, wantBottom);

  if (prev && prev.start >= 0 && prev.end >= prev.start) {
    const prevValid = prev.start < count && prev.end < count;
    if (prevValid && prev.start <= desiredStart && prev.end >= desiredEnd) {
      const slackTopRows = wantTop - (tops[prev.start] ?? 0);
      const slackBottomRows = (tops[prev.end + 1] ?? 0) - wantBottom;
      if (slackTopRows <= PARK_SLACK_ROWS && slackBottomRows <= PARK_SLACK_ROWS) {
        // Keep following the tail while pinned there (streaming appends).
        if (prev.atTail && prev.end === count - 1) return prev;
        if (!prev.atTail) return prev;
      }
    }
  }

  const start = indexAtRow(tops, wantTop - MOUNT_CHUNK_ROWS);
  const end = indexAtRow(tops, wantBottom + MOUNT_CHUNK_ROWS);
  return { start, end, atTail: end >= count - 1 };
}

/** Largest index i (clamped to [0, N-1]) whose top is <= row. */
function indexAtRow(tops: readonly number[], row: number): number {
  const count = tops.length - 1;
  if (count <= 0) return 0;
  if (row <= tops[0]!) return 0;
  if (row >= tops[count]!) return count - 1;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]! <= row) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Approximate terminal cell width of a line: wide (CJK & friends) count 2. */
function approxCells(line: string): number {
  let extra = 0;
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i);
    if (code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6))) {
      extra++;
    }
  }
  return line.length + extra;
}

function wrappedRows(text: string | undefined, width: number): number {
  if (!text) return 0;
  const w = Math.max(8, width);
  let rows = 0;
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      const line = text.slice(lineStart, i);
      rows += Math.max(1, Math.ceil(approxCells(line) / w));
      lineStart = i + 1;
    }
  }
  return rows;
}

/**
 * Cheap height estimate (rows) for an entry that has never been laid out.
 * Only affects scrollbar geometry for unvisited regions and the size of the
 * first correction on mount — accuracy is nice, exactness is not required.
 */
export function estimateEntryRows(entry: PresentationEntry, contentWidth: number): number {
  switch (entry.kind) {
    case "user":
      // Bordered/padded block + one row per wrapped line + trailing gap.
      return wrappedRows(entry.userText ?? "", contentWidth - 4) + 3;
    case "thinking":
      // Collapsed one-line header plus margin.
      return 2;
    case "assistant":
      return wrappedRows(entry.assistantText ?? "", contentWidth) + 1;
    case "tool_operation": {
      let rows = 2; // header line + trailing gap
      const inline = entry.toolInlineResult;
      if (inline?.text) {
        rows += Math.min(
          inline.maxLines > 0 ? inline.maxLines + 2 : 10,
          wrappedRows(inline.text, contentWidth - 4),
        );
      }
      const fmd = entry.fileModifyData;
      if (fmd) {
        const diffLines = fmd.writeLines?.length
          ?? fmd.hunks.reduce(
            (acc, h) =>
              acc
              + h.contextBefore.length
              + h.deletions.length
              + h.additions.length
              + h.contextAfter.length,
            0,
          );
        // Inline file-modify blocks cap at ~25 visible lines plus chrome.
        rows += Math.min(diffLines, 25) + 2;
      }
      return rows;
    }
    case "tool_group":
      return 2 + (entry.groupEntries?.length ?? 0);
    case "system":
      return wrappedRows(entry.systemText ?? "", contentWidth) + 1;
    case "turn_summary":
      return 2;
    default:
      return 2;
  }
}
