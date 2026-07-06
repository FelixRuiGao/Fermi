import { describe, expect, test } from "bun:test";

import type { PresentationEntry } from "../../presentation/types.js";
import {
  MOUNT_MARGIN_ROWS,
  PARK_SLACK_ROWS,
  TranscriptHeightModel,
  buildPrefixTops,
  computeMountWindow,
  estimateEntryRows,
} from "./transcript-virtualization.js";

function entry(id: string, kind: PresentationEntry["kind"], extra: Partial<PresentationEntry> = {}): PresentationEntry {
  return { id, contentVersion: 1, kind, state: "done", ...extra } as PresentationEntry;
}

function makeItems(count: number): PresentationEntry[] {
  return Array.from({ length: count }, (_, i) =>
    entry(`e-${i}`, "assistant", { assistantText: "line one\nline two\nline three" }),
  );
}

describe("estimateEntryRows", () => {
  test("wraps long lines by width", () => {
    const e = entry("a", "assistant", { assistantText: "x".repeat(200) });
    expect(estimateEntryRows(e, 100)).toBe(2 + 1); // 200/100 wrapped + 1 overhead
  });

  test("counts CJK as double width", () => {
    const e = entry("a", "assistant", { assistantText: "中".repeat(50) });
    // 50 chars * 2 cells = 100 cells → 2 rows at width 50, +1 overhead
    expect(estimateEntryRows(e, 50)).toBe(3);
  });

  test("collapsed thinking is constant", () => {
    expect(estimateEntryRows(entry("t", "thinking", { thinkingFullText: "x\n".repeat(500) }), 80)).toBe(2);
  });

  test("tool operation caps inline and diff contributions", () => {
    const e = entry("op", "tool_operation", {
      toolInlineResult: { text: "l\n".repeat(500), dim: false, maxLines: 8 },
      fileModifyData: {
        hunks: [],
        writeLines: Array.from({ length: 400 }, () => "w"),
      } as unknown as PresentationEntry["fileModifyData"],
    });
    const rows = estimateEntryRows(e, 80);
    expect(rows).toBeLessThan(60); // far below the 900 raw lines
    expect(rows).toBeGreaterThan(10);
  });
});

describe("TranscriptHeightModel", () => {
  test("estimates then measures with delta", () => {
    const model = new TranscriptHeightModel();
    const e = entry("a", "assistant", { assistantText: "one\ntwo" });
    const est = model.heightFor(e, 80);
    expect(est).toBe(3);
    const delta = model.recordMeasurement(e, 80, 7);
    expect(delta).toBe(4);
    expect(model.heightFor(e, 80)).toBe(7);
    // Same measurement again is a no-op.
    expect(model.recordMeasurement(e, 80, 7)).toBe(0);
  });

  test("demote keeps rows as estimates", () => {
    const model = new TranscriptHeightModel();
    const e = entry("a", "user", { userText: "hi" });
    model.heightFor(e, 80);
    model.recordMeasurement(e, 80, 9);
    model.demoteMeasurements();
    expect(model.heightFor(e, 80)).toBe(9);
    // Re-measuring after demotion records a fresh measurement.
    expect(model.recordMeasurement(e, 80, 9)).toBe(0);
  });

  test("prune drops dead ids", () => {
    const model = new TranscriptHeightModel();
    const a = entry("a", "user", { userText: "hi" });
    const b = entry("b", "user", { userText: "hello there" });
    model.recordMeasurement(a, 80, 5);
    model.recordMeasurement(b, 80, 6);
    model.prune(new Set(["b"]));
    // 'a' falls back to estimate, 'b' keeps its measurement.
    expect(model.heightFor(b, 80)).toBe(6);
    expect(model.heightFor(a, 80)).toBe(estimateEntryRows(a, 80));
  });
});

describe("buildPrefixTops / computeMountWindow", () => {
  test("prefix tops accumulate with offset", () => {
    const model = new TranscriptHeightModel();
    const items = makeItems(3); // each estimates 3+1=4 rows
    const tops = buildPrefixTops(items, model, 80, 5);
    expect(tops).toEqual([5, 9, 13, 17]);
  });

  test("window covers viewport plus margins", () => {
    const model = new TranscriptHeightModel();
    const items = makeItems(200); // 4 rows each → 800 total
    const tops = buildPrefixTops(items, model, 80, 0);
    const win = computeMountWindow({ tops, scrollTop: 400, viewportHeight: 40, prev: null });
    // Must cover at least rows [400 - margin, 440 + margin].
    expect(tops[win.start]!).toBeLessThanOrEqual(400 - MOUNT_MARGIN_ROWS);
    expect(tops[win.end + 1]!).toBeGreaterThanOrEqual(440 + MOUNT_MARGIN_ROWS);
    expect(win.atTail).toBe(false);
    // And not absurdly more than the slack allows.
    expect(400 - tops[win.start]!).toBeLessThanOrEqual(PARK_SLACK_ROWS);
    expect(tops[win.end + 1]! - 440).toBeLessThanOrEqual(PARK_SLACK_ROWS);
  });

  test("stable window is reused (hysteresis)", () => {
    const model = new TranscriptHeightModel();
    const items = makeItems(200);
    const tops = buildPrefixTops(items, model, 80, 0);
    const first = computeMountWindow({ tops, scrollTop: 400, viewportHeight: 40, prev: null });
    // Scroll a few rows — still inside the mounted chunk → same window object.
    const second = computeMountWindow({ tops, scrollTop: 408, viewportHeight: 40, prev: first });
    expect(second).toBe(first);
    // Scroll far — window rebuilds.
    const third = computeMountWindow({ tops, scrollTop: 700, viewportHeight: 40, prev: first });
    expect(third).not.toBe(first);
    expect(third.start).toBeGreaterThan(first.start);
  });

  test("bottom scroll yields tail window", () => {
    const model = new TranscriptHeightModel();
    const items = makeItems(200);
    const tops = buildPrefixTops(items, model, 80, 0);
    const total = tops[tops.length - 1]!;
    const win = computeMountWindow({ tops, scrollTop: total - 40, viewportHeight: 40, prev: null });
    expect(win.end).toBe(199);
    expect(win.atTail).toBe(true);
  });

  test("empty transcript", () => {
    const win = computeMountWindow({ tops: [0], scrollTop: 0, viewportHeight: 40, prev: null });
    expect(win.start).toBe(0);
    expect(win.end).toBe(-1);
  });

  test("window indices always valid after shrink", () => {
    const model = new TranscriptHeightModel();
    const items = makeItems(10);
    const tops = buildPrefixTops(items, model, 80, 0);
    const stale = { start: 150, end: 190, atTail: false };
    const win = computeMountWindow({ tops, scrollTop: 0, viewportHeight: 40, prev: stale });
    expect(win.start).toBeGreaterThanOrEqual(0);
    expect(win.end).toBeLessThanOrEqual(9);
  });
});
