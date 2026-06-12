/**
 * API projection cache — the memoized projection must be byte-identical to
 * an uncached projectToApiMessages call with the same options, on both cache
 * misses and hits, and must invalidate on any touched log mutation.
 */

import { describe, expect, it } from "bun:test";

import type { LogEntry } from "../src/log-entry.js";
import { projectToApiMessages } from "../src/log-projection.js";
import { makeScriptedSession, testToolDef, type SessionHarness } from "./helpers/session-harness.js";

function naiveProjection(h: SessionHarness): string {
  return JSON.stringify(projectToApiMessages(h.session.log as LogEntry[], {
    systemPrompt: h.internals._getSystemPrompt(),
    resolveImageRef: (p: string) => h.internals._resolveImageRef(p),
    requiresAlternatingRoles: (h.session.primaryAgent as { _provider?: { requiresAlternatingRoles?: boolean } })._provider?.requiresAlternatingRoles,
    enforceToolCallProtocol: true,
  }));
}

describe("API projection cache", () => {
  it("is byte-identical to the uncached projection on miss and on hit", async () => {
    const h = makeScriptedSession({
      rounds: [
        { text: "plain reply" },
        { toolCalls: [{ id: "call-1", name: "probe_tool", arguments: { q: 1 } }] },
        { text: "after tool" },
      ],
      tools: [testToolDef("probe_tool")],
      toolExecutorOverrides: { probe_tool: () => "probe result" },
    });
    h.session.permissionMode = "yolo";
    try {
      await h.session.turn("first");
      // Miss (fresh revision), then hit — both must equal the naive recompute.
      const naive1 = naiveProjection(h);
      expect(JSON.stringify(h.internals._projectApiMessagesCached())).toBe(naive1);
      expect(JSON.stringify(h.internals._projectApiMessagesCached())).toBe(naive1);

      await h.session.turn("use the tool");
      const naive2 = naiveProjection(h);
      expect(naive2).not.toBe(naive1);
      expect(JSON.stringify(h.internals._projectApiMessagesCached())).toBe(naive2);
      expect(JSON.stringify(h.internals._projectApiMessagesCached())).toBe(naive2);
    } finally {
      h.dispose();
    }
  });

  it("returns a fresh top-level array on every call", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "hi" }] });
    try {
      await h.session.turn("hello");
      const a = h.internals._projectApiMessagesCached();
      const b = h.internals._projectApiMessagesCached();
      expect(b).not.toBe(a);
      expect(b).toEqual(a);
    } finally {
      h.dispose();
    }
  });

  it("invalidates on touched in-place mutation and on append", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "original words" }] });
    try {
      await h.session.turn("hello");
      const before = h.internals._projectApiMessagesCached() as Array<Record<string, unknown>>;
      expect(JSON.stringify(before)).toContain("original words");

      // In-place content mutation through the official touch contract.
      const assistant = h.session.log.find((e) => e.type === "assistant_text" && !e.discarded)!;
      assistant.content = "rewritten words";
      h.internals._touchLog();
      const after = h.internals._projectApiMessagesCached();
      expect(JSON.stringify(after)).toContain("rewritten words");
      expect(JSON.stringify(after)).not.toContain("original words");
      expect(JSON.stringify(after)).toBe(naiveProjection(h));

      // Append-driven invalidation.
      h.session.appendErrorMessage("boom happened", "test");
      expect(JSON.stringify(h.internals._projectApiMessagesCached())).toBe(naiveProjection(h));
    } finally {
      h.dispose();
    }
  });

  it("does not survive /new — colliding revisions of the fresh conversation must not serve the old one", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "reply alpha" }] });
    try {
      await h.session.turn("alpha secret input");
      const cachedAt = h.session.getLogRevision();
      expect(JSON.stringify(h.internals._projectApiMessagesCached())).toContain("alpha secret input");

      await h.session.resetForNewSession();
      // The revision sequence restarts after /new — walk it back up to the
      // exact revision the cache was populated at.
      while (h.session.getLogRevision() < cachedAt) h.internals._touchLog();
      expect(h.session.getLogRevision()).toBe(cachedAt);

      const fresh = JSON.stringify(h.internals._projectApiMessagesCached());
      expect(fresh).not.toContain("alpha secret input");
      expect(fresh).toBe(naiveProjection(h));
    } finally {
      h.dispose();
    }
  });

  it("keys on the system prompt so prompt reloads invalidate", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "hi" }] });
    try {
      await h.session.turn("hello");
      const before = JSON.stringify(h.internals._projectApiMessagesCached());

      // Same revision, different prompt → must recompute, not serve stale.
      h.internals._cachedSystemPrompt = "PATCHED PROMPT";
      const after = JSON.stringify(h.internals._projectApiMessagesCached());
      expect(after).not.toBe(before);
      expect(after).toContain("PATCHED PROMPT");
      expect(after).toBe(naiveProjection(h));
    } finally {
      h.dispose();
    }
  });
});
