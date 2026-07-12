/**
 * RPC protocol surface (Phase 3) — lifecycle forwarding, ask events,
 * projected log, protocol handshake.
 *
 * Drives registerSessionRpc with a real harness Session and an in-memory
 * RpcServer fake, asserting on the exact wire events a GUI/VSCode client
 * receives.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { projectToTuiEntries } from "../src/log-projection.js";
import type { LogEntry } from "../src/log-entry.js";
import type { RpcHandler, RpcServer } from "../src/server/rpc-transport.js";
import {
  PROTOCOL_CAPABILITIES,
  PROTOCOL_VERSION,
  buildMeta,
  registerSessionRpc,
} from "../src/server/session-rpc.js";
import type { Session } from "../src/session.js";
import {
  ScriptedProvider,
  makeScriptedAgentObject,
  makeScriptedSession,
  stageApprovalGate,
  testToolDef,
  waitFor,
  type SessionHarness,
} from "./helpers/session-harness.js";

interface FakeRpcServer extends RpcServer {
  events: Array<{ method: string; params: unknown }>;
  call(method: string, params?: unknown): Promise<unknown>;
  eventsOf(method: string): unknown[];
}

function makeFakeRpcServer(): FakeRpcServer {
  const handlers = new Map<string, RpcHandler>();
  const events: Array<{ method: string; params: unknown }> = [];
  return {
    events,
    on(method, handler) {
      handlers.set(method, handler);
    },
    emit(method, params) {
      events.push({ method, params });
    },
    close() { /* no-op */ },
    async call(method, params) {
      const handler = handlers.get(method);
      if (!handler) throw new Error(`no handler for ${method}`);
      return handler(params);
    },
    eventsOf(method) {
      return events.filter((e) => e.method === method).map((e) => e.params);
    },
  };
}

function bind(h: SessionHarness): { rpc: FakeRpcServer; dispose: () => void } {
  const rpc = makeFakeRpcServer();
  const bound = registerSessionRpc({
    session: h.session as unknown as Session,
    server: rpc,
    sessionDir: null,
    workDir: h.projectRoot,
    onShutdown: async () => { /* no-op */ },
  });
  return { rpc, dispose: bound.dispose };
}

describe("protocol handshake", () => {
  it("ready meta advertises protocolVersion and capabilities", () => {
    const h = makeScriptedSession({ rounds: [] });
    try {
      const meta = buildMeta(h.session as unknown as Session, h.projectRoot, null);
      // Pin the literal wire values (not the exported constants — comparing a
      // constant to itself would let a typo sail through). Adding a NEW
      // capability is fine; renaming or dropping one is a breaking change.
      expect(meta.protocolVersion).toBe(1);
      expect([...meta.capabilities]).toEqual([
        "projectedLog",
        "askEvents",
        "turnLifecycle",
        "waitingStatus",
        "crashEvent",
        "injectedTurn",
        "invokeSkill",
        "thinkingLevel",
        "mcpControl",
        "hooksControl",
        "sharedSettings",
        "watchEvents",
        "childMeta",
        "modelCatalog",
        "turnAttachments",
        "providerControl",
        "workspaceTrust",
        "permissionRules",
      ]);
      expect(PROTOCOL_VERSION).toBe(1);
      expect(meta.capabilities).toEqual(PROTOCOL_CAPABILITIES);
    } finally {
      h.dispose();
    }
  });
});

describe("turn lifecycle over RPC", () => {
  it("submitTurn → started + ended(completed) from the runtime", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "hi" }] });
    const { rpc, dispose } = bind(h);
    try {
      await rpc.call("session.submitTurn", { input: "hello" });
      await waitFor(() => rpc.eventsOf("turn.ended").length > 0);
      expect(rpc.eventsOf("turn.started").length).toBe(1);
      expect(rpc.eventsOf("turn.ended")[0]).toMatchObject({ status: "completed" });
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("provider failure → exactly one turn.ended(error) with the message", async () => {
    const h = makeScriptedSession({
      rounds: [{ onCall: () => { throw new Error("upstream 400"); } }],
    });
    const { rpc, dispose } = bind(h);
    try {
      await rpc.call("session.submitTurn", { input: "hello" });
      await waitFor(() => rpc.eventsOf("turn.ended").length > 0);
      // Let the fire-and-forget catch settle: the handler must NOT add a
      // duplicate turn.ended on top of the runtime's lifecycle event.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ended = rpc.eventsOf("turn.ended");
      expect(ended.length).toBe(1);
      expect(ended[0]).toMatchObject({ status: "error", error: "upstream 400" });
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("turn parking on an ask → turn.ended(waiting) + ask.pending", async () => {
    const h = makeScriptedSession({
      rounds: [
        { toolCalls: [{ id: "call-1", name: "write_file", arguments: {} }] },
        { text: "done" },
      ],
      tools: [testToolDef("write_file")],
    });
    const { rpc, dispose } = bind(h);
    try {
      stageApprovalGate(h, "write_file");
      await rpc.call("session.submitTurn", { input: "write it" });
      await waitFor(() => rpc.eventsOf("turn.ended").length > 0);
      expect(rpc.eventsOf("turn.ended")[0]).toMatchObject({ status: "waiting" });
      expect(rpc.eventsOf("ask.pending")).toMatchObject([{ id: "approval-test-1" }]);
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("a queued turn's pre-activation failure still reaches the wire (no dedup window loss)", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "first ok" }] });
    const { rpc, dispose } = bind(h);
    try {
      // Turn A succeeds; turn B (queued same tick) dies before its activation
      // loop. The old global-counter dedup suppressed B's turn.ended because
      // A's ended had already advanced the counter.
      let calls = 0;
      const realEnsure = h.internals._ensureSessionStorageReady.bind(h.session);
      h.internals._ensureSessionStorageReady = () => {
        calls += 1;
        if (calls >= 2) throw new Error("disk vanished");
        realEnsure();
      };
      await rpc.call("session.submitTurn", { input: "one" });
      await rpc.call("session.submitTurn", { input: "two" });
      await waitFor(() => rpc.eventsOf("turn.ended").length >= 2);
      const ended = rpc.eventsOf("turn.ended") as Array<{ status: string; error?: string }>;
      expect(ended[0]).toMatchObject({ status: "completed" });
      expect(ended[1]).toMatchObject({ status: "error", error: "disk vanished" });
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("auto-resume turns emit lifecycle events without any RPC caller", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "processed" }] });
    const { rpc, dispose } = bind(h);
    try {
      h.session.deliverMessage("user", "background ping");
      await waitFor(() => rpc.eventsOf("turn.ended").length > 0);
      expect(rpc.eventsOf("turn.started").length).toBe(1);
      expect(rpc.eventsOf("turn.ended")[0]).toMatchObject({ status: "completed" });
    } finally {
      dispose();
      h.dispose();
    }
  });
});

describe("ask events over RPC", () => {
  it("child-session asks reach the wire (the old log-poll never saw these)", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "noted" }] });
    const { rpc, dispose } = bind(h);
    try {
      const childProvider = new ScriptedProvider();
      childProvider.rounds = [
        { toolCalls: [{ id: "call-c1", name: "write_file", arguments: {} }] },
        { text: "done" },
      ];
      const childAgent = makeScriptedAgentObject(childProvider, {
        name: "worker-1",
        tools: [testToolDef("write_file")],
      });
      const handle = h.internals._instantiateChildSession("worker-1", "explorer", "persistent", childAgent);
      h.internals._childSessions.set("worker-1", handle);
      let fired = false;
      handle.session._beforeToolExecute = async (ctx: { toolName: string }) => {
        if (ctx.toolName !== "write_file" || fired) return undefined;
        fired = true;
        return {
          kind: "ask",
          ask: {
            id: "approval-child",
            kind: "approval",
            createdAt: new Date().toISOString(),
            source: { agentId: "worker-1", agentName: "worker-1" },
            summary: "Allow write_file?",
            roundIndex: undefined,
            payload: {
              toolCallId: "",
              toolName: "write_file",
              toolSummary: "worker-1 is calling write_file",
              permissionClass: "write",
              offers: [{ type: "tool_once", label: "Allow once" }],
            },
            options: ["Allow once", "Deny"],
          },
        };
      };

      await h.internals._execSend({ to: "worker-1", content: "write it" });
      await waitFor(() => rpc.eventsOf("ask.pending").length > 0);
      expect(rpc.eventsOf("ask.pending")[0]).toMatchObject({ id: "approval-child" });
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("resolving an ask emits ask.resolved", async () => {
    const h = makeScriptedSession({
      rounds: [
        { toolCalls: [{ id: "call-1", name: "write_file", arguments: {} }] },
        { text: "done" },
      ],
      tools: [testToolDef("write_file")],
    });
    const { rpc, dispose } = bind(h);
    try {
      stageApprovalGate(h, "write_file");
      await rpc.call("session.submitTurn", { input: "write it" });
      await waitFor(() => rpc.eventsOf("ask.pending").length > 0);
      h.session.resolveApprovalAsk("approval-test-1", 0);
      await waitFor(() => rpc.eventsOf("ask.resolved").length > 0);
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("approving over RPC auto-resumes the parked turn to completion", async () => {
    const h = makeScriptedSession({
      rounds: [
        { toolCalls: [{ id: "call-1", name: "write_file", arguments: {} }] },
        { text: "done after approval" },
      ],
      tools: [testToolDef("write_file")],
    });
    const { rpc, dispose } = bind(h);
    try {
      stageApprovalGate(h, "write_file");
      await rpc.call("session.submitTurn", { input: "write it" });
      await waitFor(() => rpc.eventsOf("ask.pending").length > 0);
      // The remote client only resolves the ask; the SERVER must drive the
      // resume (the TUI does this in-process — without it the session sat
      // parked forever after an approval from VS Code/GUI).
      await rpc.call("session.resolveApprovalAsk", { askId: "approval-test-1", choiceIndex: 0 });
      await waitFor(() => rpc.eventsOf("turn.ended").some(
        (e) => (e as { status: string }).status === "completed",
      ));
      // The resume emitted its own started (covering the approved tool's
      // drain-phase execution), paired with the completed ended.
      expect(rpc.eventsOf("turn.started").length).toBe(2);
      const projected = await rpc.call("session.getProjectedLog") as {
        entries: Array<{ kind: string; text: string }>;
      };
      expect(projected.entries.some((e) => e.text.includes("done after approval"))).toBe(true);
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("denying over RPC resumes so the model sees the denial", async () => {
    const h = makeScriptedSession({
      rounds: [
        { toolCalls: [{ id: "call-1", name: "write_file", arguments: {} }] },
        { text: "acknowledged the denial" },
      ],
      tools: [testToolDef("write_file")],
    });
    const { rpc, dispose } = bind(h);
    try {
      stageApprovalGate(h, "write_file");
      await rpc.call("session.submitTurn", { input: "write it" });
      await waitFor(() => rpc.eventsOf("ask.pending").length > 0);
      const res = await rpc.call("session.denyPendingAsk") as { denied: boolean };
      expect(res.denied).toBe(true);
      await waitFor(() => rpc.eventsOf("turn.ended").some(
        (e) => (e as { status: string }).status === "completed",
      ));
      const projected = await rpc.call("session.getProjectedLog") as {
        entries: Array<{ kind: string; text: string }>;
      };
      expect(projected.entries.some((e) => e.text.includes("acknowledged the denial"))).toBe(true);
    } finally {
      dispose();
      h.dispose();
    }
  });
});

describe("turn state on the wire", () => {
  it("no post-ended log.changed strands the client on currentTurnRunning=true", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "hi" }] });
    const { rpc, dispose } = bind(h);
    try {
      await rpc.call("session.submitTurn", { input: "hello" });
      await waitFor(() => rpc.eventsOf("turn.ended").length > 0);
      // Let the coalesced log.changed microtask flush — the end-of-turn log
      // writes queue one BEFORE turn.ended is emitted, and it used to
      // snapshot the still-held turn lock as currentTurnRunning=true.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const events = rpc.events;
      const endedIdx = events.findIndex((e) => e.method === "turn.ended");
      expect(endedIdx).toBeGreaterThan(-1);
      const trailing = events.slice(endedIdx + 1).filter((e) => e.method === "log.changed");
      // The racy snapshot is deterministic: there IS a trailing log.changed.
      expect(trailing.length).toBeGreaterThan(0);
      for (const e of trailing) {
        const status = (e.params as { status: { currentTurnRunning: boolean } }).status;
        expect(status.currentTurnRunning).toBe(false);
      }
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("getStatus during a parked ask reports not running", async () => {
    const h = makeScriptedSession({
      rounds: [
        { toolCalls: [{ id: "call-1", name: "write_file", arguments: {} }] },
        { text: "done" },
      ],
      tools: [testToolDef("write_file")],
    });
    const { rpc, dispose } = bind(h);
    try {
      stageApprovalGate(h, "write_file");
      await rpc.call("session.submitTurn", { input: "write it" });
      await waitFor(() => rpc.eventsOf("ask.pending").length > 0);
      await waitFor(() => rpc.eventsOf("turn.ended").length > 0);
      const status = await rpc.call("session.getStatus") as {
        currentTurnRunning: boolean;
      };
      // Parked on the ask: the AskPanel owns the UI; no spinner, no stop.
      // (_pendingTurnState only exists AFTER the ask resolves, so
      // hasPendingTurn is false here by design.)
      expect(status.currentTurnRunning).toBe(false);
    } finally {
      dispose();
      h.dispose();
    }
  });
});

describe("model catalog over RPC", () => {
  interface CatalogNode {
    kind: string;
    label: string;
    value: string;
    isCurrent: boolean;
    children?: CatalogNode[];
  }

  it("returns a grouped tree with clean model-leaf labels", async () => {
    const h = makeScriptedSession({ rounds: [] });
    const { rpc, dispose } = bind(h);
    try {
      const tree = await rpc.call("session.getModelCatalog") as CatalogNode[];
      expect(tree.length).toBeGreaterThan(0);
      // Top level is provider/group nodes, never bare model leaves or actions.
      for (const node of tree) {
        expect(["group", "provider", "vendor"]).toContain(node.kind);
      }
      // Collect every model leaf and assert on the clean-label contract.
      const leaves: CatalogNode[] = [];
      const walk = (nodes: CatalogNode[]) => {
        for (const n of nodes) {
          if (n.kind === "model") leaves.push(n);
          if (n.children) walk(n.children);
        }
      };
      walk(tree);
      expect(leaves.length).toBeGreaterThan(0);
      const anthropicLeaf = leaves.find((l) => l.value.startsWith("anthropic:"));
      expect(anthropicLeaf).toBeDefined();
      // Label is the human name ("Claude …"), NOT the raw "provider:model".
      expect(anthropicLeaf!.label).not.toContain(":");
      expect(anthropicLeaf!.label.toLowerCase()).toContain("claude");
      // Value is what selectModel accepts.
      expect(anthropicLeaf!.value).toBe(`anthropic:${anthropicLeaf!.value.split(":")[1]}`);
      // No "action" nodes leaked through (they'd carry flows the client lacks).
      expect(JSON.stringify(tree)).not.toContain('"kind":"action"');
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("meta carries a clean modelDisplayLabel and advertises the capability", () => {
    const h = makeScriptedSession({ rounds: [] });
    try {
      const meta = buildMeta(h.session as unknown as Session, h.projectRoot, null);
      expect(meta.modelDisplayLabel).toBe("GPT Test");
      expect(meta.capabilities).toContain("modelCatalog");
    } finally {
      h.dispose();
    }
  });
});

describe("projected log over RPC", () => {
  it("getProjectedLog returns the canonical TUI projection, JSON-serializable", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "hello there" }] });
    const { rpc, dispose } = bind(h);
    try {
      await h.session.turn("hi");
      const result = await rpc.call("session.getProjectedLog") as {
        revision: number;
        activeLogEntryId: string | null;
        entries: Array<{ kind: string; text: string }>;
      };
      expect(result.revision).toBe(h.session.getLogRevision());
      const expected = projectToTuiEntries([...h.session.log] as LogEntry[]);
      expect(result.entries).toEqual(expected as never);
      expect(result.entries.some((e) => e.kind === "user")).toBe(true);
      expect(result.entries.some((e) => e.kind === "assistant" && e.text.includes("hello there"))).toBe(true);
      // The wire payload must survive JSON round-trip losslessly.
      expect(JSON.parse(JSON.stringify(result))).toEqual(result as never);
    } finally {
      dispose();
      h.dispose();
    }
  });

  it("getProjectedChildLog projects a child session's log", async () => {
    const h = makeScriptedSession({ rounds: [{ text: "noted" }] });
    const { rpc, dispose } = bind(h);
    try {
      const childProvider = new ScriptedProvider();
      childProvider.rounds = [{ text: "child says hi" }];
      const childAgent = makeScriptedAgentObject(childProvider, { name: "worker-1" });
      const handle = h.internals._instantiateChildSession("worker-1", "explorer", "persistent", childAgent);
      h.internals._childSessions.set("worker-1", handle);
      await h.internals._execSend({ to: "worker-1", content: "say hi" });
      await waitFor(() => handle.lastOutcome === "completed");

      const entries = await rpc.call("session.getProjectedChildLog", { childId: "worker-1" }) as Array<{ kind: string; text: string }>;
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.some((e) => e.kind === "assistant" && e.text.includes("child says hi"))).toBe(true);

      const missing = await rpc.call("session.getProjectedChildLog", { childId: "nope" });
      expect(missing).toBeNull();
    } finally {
      dispose();
      h.dispose();
    }
  });
});

describe("control-plane isolation (FERMI_HOME)", () => {
  // These handlers read/write the *global* ~/.fermi state (settings.json,
  // hooks/). getFermiHomeDir() honours FERMI_HOME, so each test points the
  // whole control plane at a throwaway dir instead of the developer's home.
  async function withTmpHome<T>(fn: (home: string) => Promise<T> | T): Promise<T> {
    const home = mkdtempSync(join(tmpdir(), "fermi-cp-"));
    const prev = process.env.FERMI_HOME;
    process.env.FERMI_HOME = home;
    try {
      return await fn(home);
    } finally {
      if (prev === undefined) delete process.env.FERMI_HOME;
      else process.env.FERMI_HOME = prev;
      rmSync(home, { recursive: true, force: true });
    }
  }

  it("settings.patch field-merges summarize_hint (a toggle keeps level1/level2)", async () => {
    await withTmpHome(async () => {
      const h = makeScriptedSession({ rounds: [] });
      const { rpc, dispose } = bind(h);
      try {
        await rpc.call("settings.patch", { summarize_hint: { enabled: true, level1: 20, level2: 40 } });
        // A partial patch that only flips `enabled` must NOT wipe the thresholds
        // (the pre-fix bug: saveGlobalSettingsPatch shallow-overwrote the key).
        await rpc.call("settings.patch", { summarize_hint: { enabled: false } });
        const got = await rpc.call("settings.get") as {
          summarize_hint?: { enabled?: boolean; level1?: number; level2?: number };
        };
        expect(got.summarize_hint).toEqual({ enabled: false, level1: 20, level2: 40 });
        expect(rpc.eventsOf("settings.changed").at(-1)).toMatchObject({
          summarize_hint: { enabled: false, level1: 20, level2: 40 },
        });
      } finally {
        dispose();
        h.dispose();
      }
    });
  });

  it("settings.patch rejects a non-integer level (parity with the TUI validator)", async () => {
    await withTmpHome(async () => {
      const h = makeScriptedSession({ rounds: [] });
      const { rpc, dispose } = bind(h);
      try {
        await expect(
          rpc.call("settings.patch", { summarize_hint: { level1: 10.5, level2: 40 } }),
        ).rejects.toThrow(/integer/i);
      } finally {
        dispose();
        h.dispose();
      }
    });
  });

  it("settings.patch re-validates the MERGED pair, not just the patched key", async () => {
    await withTmpHome(async () => {
      const h = makeScriptedSession({ rounds: [] });
      const { rpc, dispose } = bind(h);
      try {
        await rpc.call("settings.patch", { summarize_hint: { enabled: true, level1: 20, level2: 40 } });
        // 90 alone looks fine, but 90 < persisted level2 (40) must fail.
        await expect(
          rpc.call("settings.patch", { summarize_hint: { level1: 90 } }),
        ).rejects.toThrow(/satisfy/i);
        // The rejected patch left the stored value untouched.
        const got = await rpc.call("settings.get") as {
          summarize_hint?: Record<string, unknown>;
        };
        expect(got.summarize_hint).toEqual({ enabled: true, level1: 20, level2: 40 });
      } finally {
        dispose();
        h.dispose();
      }
    });
  });

  it("setHookEnabled targets the last same-named hook (the copy the runtime loads)", async () => {
    await withTmpHome(async (home) => {
      const hooksRoot = join(home, "hooks");
      const writeHook = (dir: string) => {
        mkdirSync(join(hooksRoot, dir), { recursive: true });
        writeFileSync(
          join(hooksRoot, dir, "hook.json"),
          JSON.stringify({ name: "iso-dup", event: "PreToolUse", type: "command", command: "true" }),
        );
      };
      // readdirSync().sort() yields [aaa, bbb]; loadHooksMulti keeps the last,
      // so the toggle must land on bbb, not the shadowed aaa.
      writeHook("aaa");
      writeHook("bbb");
      const h = makeScriptedSession({ rounds: [] });
      const { rpc, dispose } = bind(h);
      try {
        await rpc.call("session.setHookEnabled", { name: "iso-dup", enabled: false });
        const bbb = JSON.parse(readFileSync(join(hooksRoot, "bbb", "hook.json"), "utf-8"));
        const aaa = JSON.parse(readFileSync(join(hooksRoot, "aaa", "hook.json"), "utf-8"));
        expect(bbb.disabled).toBe(true);
        expect(aaa.disabled).toBeUndefined();
      } finally {
        dispose();
        h.dispose();
      }
    });
  });
});
