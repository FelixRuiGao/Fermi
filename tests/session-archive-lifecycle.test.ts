/**
 * Archive lifecycle — archived entry content must be restored when a rewind
 * truncates the summary / compact marker that justified the archival.
 *
 * Background: the API projection silently skips entries with
 * `archived && content === null`. Archival is only sound while the covering
 * summary or compact marker is live; rewind truncation (`_log.length = cutoff`)
 * can remove the marker while the covered entries survive, so their content
 * must come back from the on-disk archive.
 */

import { describe, expect, it } from "bun:test";

import { createCompactMarker, type LogEntry } from "../src/log-entry.js";
import { archiveWindow } from "../src/persistence.js";
import { makeScriptedSession } from "./helpers/session-harness.js";

function turnRange(log: readonly LogEntry[], turnIndex: number): { start: number; end: number } {
  let start = -1;
  let end = -1;
  for (let i = 0; i < log.length; i++) {
    if (log[i].turnIndex !== turnIndex) continue;
    if (start < 0) start = i;
    end = i;
  }
  return { start, end };
}

function captureContents(log: readonly LogEntry[], start: number, end: number): Map<string, unknown> {
  const captured = new Map<string, unknown>();
  for (let i = start; i <= end; i++) {
    const e = log[i];
    if (e.content !== null && !e.archived) {
      captured.set(e.id, JSON.parse(JSON.stringify(e.content)));
    }
  }
  return captured;
}

describe("rewind across a compact marker", () => {
  it("restores archived window content for the revived entries", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "reply one" }, { text: "reply two" }] });
    try {
      await h.session.turn("one");
      await h.session.turn("two");

      const log = h.session.log as LogEntry[];
      const sessionDir = h.internals._store.sessionDir as string;
      expect(sessionDir).toBeTruthy();

      const { start, end } = turnRange(log, 1);
      expect(start).toBeGreaterThan(-1);
      const originals = captureContents(log, start, end);
      expect(originals.size).toBeGreaterThan(0);

      // Simulate what a compact does: archive the pre-marker window, then
      // append the marker itself.
      archiveWindow(sessionDir, 0, log, start, end);
      for (const id of originals.keys()) {
        const e = log.find((x) => x.id === id)!;
        expect(e.content).toBeNull();
        expect(e.archived).toBe(true);
      }
      h.internals._appendEntry(createCompactMarker("cm-test-0", 2, 0, 100, 0), false);

      // Rewind to turn 2 truncates the marker; turn-1 entries survive and are
      // live context again — their content must be back.
      const result = h.session.rewindConversation(2);
      expect(result.error).toBeUndefined();
      expect(h.session.log.some((e) => e.type === "compact_marker")).toBe(false);
      for (const [id, content] of originals) {
        const e = h.session.log.find((x) => x.id === id);
        expect(e).toBeDefined();
        expect(e!.archived).toBe(false);
        expect(e!.content).toEqual(content as never);
      }
    } finally {
      h.dispose();
    }
  });

  it("degrades silently when the archive file is missing", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "reply one" }, { text: "reply two" }] });
    try {
      await h.session.turn("one");
      await h.session.turn("two");

      const log = h.session.log as LogEntry[];
      const { start, end } = turnRange(log, 1);
      const archivedIds: string[] = [];
      for (let i = start; i <= end; i++) {
        const e = log[i];
        if (e.content !== null) {
          e.content = null;
          e.archived = true;
          archivedIds.push(e.id);
        }
      }
      expect(archivedIds.length).toBeGreaterThan(0);
      // Marker references window 7 — no such archive file exists.
      h.internals._appendEntry(createCompactMarker("cm-test-7", 2, 7, 100, 0), false);

      const result = h.session.rewindConversation(2);
      expect(result.error).toBeUndefined();
      for (const id of archivedIds) {
        const e = h.session.log.find((x) => x.id === id)!;
        expect(e.archived).toBe(true);
        expect(e.content).toBeNull();
      }
    } finally {
      h.dispose();
    }
  });
});
