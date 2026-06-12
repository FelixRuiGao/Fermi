/**
 * TUI projection memoization — with a revision supplied, the memoized
 * projection must stay byte-identical to the unmemoized projection of an
 * identical log, across appends (incremental elapsed pairing), fold-active
 * logs (3+ compact markers), repeats at the same revision, and rewind-style
 * truncation with invalidation.
 */

import { describe, expect, it } from "bun:test";

import type { LogEntry } from "../src/log-entry.js";
import { invalidateTuiProjectionMemos, projectToTuiEntries } from "../src/log-projection.js";

let seed = 0x9e3779b;
function rng(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

let entrySeq = 0;
function randomEntry(): LogEntry {
  const i = entrySeq++;
  const r = rng();
  const base = {
    id: `e-${i}`,
    turnIndex: 1 + Math.floor(i / 10),
    timestamp: 1000 + i * 7,
    discarded: rng() < 0.1,
    archived: false,
    tuiVisible: true,
    apiRole: null as never,
    displayKind: null as never,
    meta: {} as Record<string, unknown>,
  };
  if (r < 0.12) {
    return {
      ...base,
      type: "tool_call",
      content: { id: `call-${i}`, name: "probe", arguments: { i } },
      display: `probe(${i})`,
      displayKind: "tool_call",
      meta: { toolCallId: `call-${i}`, toolName: "probe", toolExecState: "completed" },
    } as unknown as LogEntry;
  }
  if (r < 0.24) {
    // Result for a recent call; half carry execStartMs.
    const target = Math.max(0, i - 1 - Math.floor(rng() * 6));
    const meta: Record<string, unknown> = { toolCallId: `call-${target}` };
    if (rng() < 0.5) meta.execStartMs = 900 + target * 7;
    return {
      ...base,
      type: "tool_result",
      content: { toolCallId: `call-${target}`, toolName: "probe", content: `out-${i}`, toolSummary: "probe" },
      display: `out-${i}`,
      displayKind: "tool_result",
      meta,
    } as unknown as LogEntry;
  }
  if (r < 0.3) {
    return {
      ...base,
      discarded: false,
      type: "compact_marker",
      content: null,
      display: "— Compacted —",
      displayKind: "compact_mark",
      meta: { compactIndex: 0, originalTokens: 1, compactedTokens: 0 },
    } as unknown as LogEntry;
  }
  if (r < 0.6) {
    return {
      ...base,
      type: "assistant_text",
      content: `assistant ${i}`,
      display: `assistant ${i}`,
      displayKind: "assistant",
      meta: { contextId: `ctx-${i}` },
    } as unknown as LogEntry;
  }
  return {
    ...base,
    type: "user_message",
    content: `user ${i}`,
    display: `user ${i}`,
    displayKind: "user",
    meta: { contextId: `ctx-${i}` },
  } as unknown as LogEntry;
}

/** Unmemoized reference: identical log content, fresh array, no revision. */
function reference(entries: LogEntry[]): string {
  return JSON.stringify(projectToTuiEntries([...entries]));
}

describe("TUI projection memo equivalence", () => {
  it("matches the unmemoized projection across incremental appends (fold active)", () => {
    const log: LogEntry[] = [];
    let revision = 0;
    for (let step = 0; step < 25; step++) {
      const burst = 1 + Math.floor(rng() * 30);
      for (let i = 0; i < burst; i++) log.push(randomEntry());
      revision += 1;

      const memoized = JSON.stringify(projectToTuiEntries(log, { revision }));
      expect(memoized).toBe(reference(log));

      // Same-revision repeat is served from the memo — identical object.
      const again = projectToTuiEntries(log, { revision });
      expect(JSON.stringify(again)).toBe(memoized);
    }
    // The random mix virtually always produces 3+ markers; assert fold engaged
    // so this test actually covers the two-window path.
    expect(log.filter((e) => e.type === "compact_marker").length).toBeGreaterThanOrEqual(3);
  });

  it("same-revision repeats return the memoized output object", () => {
    const log: LogEntry[] = [];
    for (let i = 0; i < 40; i++) log.push(randomEntry());
    const a = projectToTuiEntries(log, { revision: 1 });
    const b = projectToTuiEntries(log, { revision: 1 });
    expect(b).toBe(a);
    const c = projectToTuiEntries(log, { revision: 2 });
    expect(c).not.toBe(a);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it("a different fold threshold at the same revision recomputes", () => {
    const log: LogEntry[] = [];
    for (let i = 0; i < 80; i++) log.push(randomEntry());
    const def = projectToTuiEntries(log, { revision: 5 });
    const wide = projectToTuiEntries(log, { revision: 5, compactFoldThreshold: 99 });
    expect(JSON.stringify(wide)).toBe(JSON.stringify(projectToTuiEntries([...log], { compactFoldThreshold: 99 })));
    expect(JSON.stringify(def)).toBe(reference(log));
  });

  it("stays correct across rewind-style truncation with invalidation", () => {
    const log: LogEntry[] = [];
    for (let i = 0; i < 100; i++) log.push(randomEntry());
    let revision = 1;
    expect(JSON.stringify(projectToTuiEntries(log, { revision }))).toBe(reference(log));

    log.length = 40;
    invalidateTuiProjectionMemos(log);
    revision += 1;
    expect(JSON.stringify(projectToTuiEntries(log, { revision }))).toBe(reference(log));

    for (let i = 0; i < 30; i++) log.push(randomEntry());
    revision += 1;
    expect(JSON.stringify(projectToTuiEntries(log, { revision }))).toBe(reference(log));
  });
});
