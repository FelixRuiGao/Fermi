/**
 * Microbenchmark for the batch-B hot-path work (Docs/perf-plan-2026-06-12.md).
 *
 * Synthesizes a realistic long-session log and times each optimized path
 * against the naive implementation it replaced. Run:
 *
 *   bun scripts/bench-log-hotpaths.ts [entryCount]
 *
 * Not wired into CI — numbers are recorded in the perf plan doc.
 */

import type { LogEntry } from "../src/log-entry.js";
import { projectToApiMessages, projectToTuiEntries } from "../src/log-projection.js";
import { SessionLog } from "../src/session/session-log.js";

const N = Number(process.argv[2] ?? 10_000);

let seed = 0xc0ffee1;
function rng(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function buildLog(count: number): LogEntry[] {
  const out: LogEntry[] = [];
  let call = 0;
  for (let i = 0; i < count; i++) {
    const r = rng();
    const base = {
      id: `e-${i}`,
      turnIndex: 1 + Math.floor(i / 24),
      timestamp: 1000 + i * 13,
      discarded: false,
      archived: false,
      tuiVisible: true,
      apiRole: null as never,
      displayKind: null as never,
      meta: {} as Record<string, unknown>,
    };
    if (r < 0.18) {
      out.push({
        ...base, type: "tool_call", apiRole: "assistant" as never,
        content: { id: `call-${call}`, name: "probe", arguments: { i } },
        display: `probe(${i})`, displayKind: "tool_call" as never,
        meta: { toolCallId: `call-${call}`, toolName: "probe", toolExecState: "completed" },
      } as unknown as LogEntry);
      call++;
    } else if (r < 0.36 && call > 0) {
      const target = call - 1;
      out.push({
        ...base, type: "tool_result", apiRole: "tool_result" as never,
        content: { toolCallId: `call-${target}`, toolName: "probe", content: `output ${i} `.repeat(20), toolSummary: "probe" },
        display: `out-${i}`, displayKind: "tool_result" as never,
        meta: { toolCallId: `call-${target}`, execStartMs: 990 + i * 13 },
      } as unknown as LogEntry);
    } else if (r < 0.66) {
      out.push({
        ...base, type: "assistant_text", apiRole: "assistant" as never, roundIndex: 0,
        content: `assistant words ${i} `.repeat(10),
        display: `assistant ${i}`, displayKind: "assistant" as never,
        meta: { contextId: `ctx-${i}` },
      } as unknown as LogEntry);
    } else {
      out.push({
        ...base, type: "user_message", apiRole: "user" as never,
        content: `user message ${i}`, display: `user ${i}`, displayKind: "user" as never,
        meta: { contextId: `ctx-${i}`, inputId: `input-${i}` },
      } as unknown as LogEntry);
    }
  }
  return out;
}

function time(label: string, iterations: number, fn: () => void): number {
  // Warmup
  for (let i = 0; i < Math.min(5, iterations); i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = (performance.now() - t0) / iterations;
  console.log(`  ${label.padEnd(58)} ${ms.toFixed(4)} ms/op`);
  return ms;
}

function speedup(naive: number, fast: number): string {
  return `${(naive / fast).toFixed(1)}x`;
}

console.log(`log size: ${N} entries\n`);
const entries = buildLog(N);

// ── 1. Entry-by-id lookup (updateEntry/discardEntry hot path) ──
{
  console.log("1. entry-by-id lookup (2000 lookups spread over the log)");
  const ids = Array.from({ length: 2000 }, (_, k) => `e-${Math.floor((k / 2000) * N)}`);
  const log = new SessionLog();
  log.replace(entries);
  const naive = time("naive entries.find per lookup", 5, () => {
    for (const id of ids) entries.find((e) => e.id === id);
  });
  const fast = time("SessionLog.findEntryById", 5, () => {
    for (const id of ids) log.findEntryById(id);
  });
  console.log(`  → ${speedup(naive, fast)}\n`);
}

// ── 2. tool_call lookup by callId (exec-state update path) ──
{
  console.log("2. tool_call lookup by callId (2000 lookups)");
  const callIds = Array.from({ length: 2000 }, (_, k) => `call-${Math.floor((k / 2000) * (N * 0.15))}`);
  const log = new SessionLog();
  log.replace(entries);
  const naive = time("naive scan per lookup", 5, () => {
    for (const id of callIds) {
      entries.find((e) => e.type === "tool_call" && String((e.meta as Record<string, unknown>)["toolCallId"] ?? "") === id);
    }
  });
  const fast = time("SessionLog.findToolCallByCallId", 5, () => {
    for (const id of callIds) log.findToolCallByCallId(id);
  });
  console.log(`  → ${speedup(naive, fast)}\n`);
}

// ── 3. pending tool_call scan (two-pass vs single-pass) ──
// Verdict (2026-06-12, 10k log): single-pass measured ~2.8x SLOWER — the
// pending-map insert/delete churn costs more than the second pass saves.
// The shipped implementation keeps the two-pass algorithm (shared helper);
// this comparison stays here as the record of why.
{
  console.log("3. pending tool_call scan over the full window");
  const twoPass = (): number => {
    const resultIds = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type !== "tool_result" || e.discarded) continue;
      const id = String((e.meta as Record<string, unknown>)["toolCallId"] ?? "");
      if (id) resultIds.add(id);
    }
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type !== "tool_call" || e.discarded) continue;
      const id = String((e.meta as Record<string, unknown>)["toolCallId"] ?? "");
      if (id && !resultIds.has(id)) return i;
    }
    return entries.length;
  };
  const singlePass = (): number => {
    const resolved = new Set<string>();
    const pending = new Map<string, number>();
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.discarded) continue;
      const meta = e.meta as Record<string, unknown>;
      if (e.type === "tool_result") {
        const id = String(meta["toolCallId"] ?? "");
        if (id) { resolved.add(id); pending.delete(id); }
      } else if (e.type === "tool_call") {
        const id = String(meta["toolCallId"] ?? "");
        if (id && !resolved.has(id) && !pending.has(id)) pending.set(id, i);
      }
    }
    const first = pending.values().next();
    return first.done ? entries.length : first.value;
  };
  if (twoPass() !== singlePass()) throw new Error("scan results diverge");
  const naive = time("two-pass", 200, () => void twoPass());
  const fast = time("single-pass", 200, () => void singlePass());
  console.log(`  → ${speedup(naive, fast)}\n`);
}

// ── 4. API projection: full recompute vs revision-keyed cache hit ──
{
  console.log("4. API projection (per provider call; retries hit the cache)");
  const options = { systemPrompt: "bench prompt", enforceToolCallProtocol: false };
  const naive = time("projectToApiMessages full recompute", 20, () => {
    projectToApiMessages(entries, options);
  });
  let cache: { revision: number; messages: Array<Record<string, unknown>> } | null = null;
  const cachedCall = (revision: number): Array<Record<string, unknown>> => {
    if (cache && cache.revision === revision) return [...cache.messages];
    const messages = projectToApiMessages(entries, options);
    cache = { revision, messages };
    return [...messages];
  };
  cachedCall(1);
  const fast = time("revision-keyed cache hit (copy-on-return)", 20, () => {
    cachedCall(1);
  });
  console.log(`  → ${speedup(naive, fast)}\n`);
}

// ── 5. TUI projection: unmemoized vs same-revision memo hit + append step ──
{
  console.log("5. TUI projection");
  const naive = time("unmemoized full projection", 20, () => {
    projectToTuiEntries([...entries]);
  });
  projectToTuiEntries(entries, { revision: 1 });
  const hit = time("same-revision memo hit", 20, () => {
    projectToTuiEntries(entries, { revision: 1 });
  });
  console.log(`  → ${speedup(naive, hit)} (memo hit)\n`);
}

// ── 6. B7 input bookkeeping scans (measured for the record; left naive) ──
{
  console.log("6. input bookkeeping scans (per user action — recorded, not indexed)");
  time("max input-index scan", 50, () => {
    let max = 0;
    for (const e of entries) {
      if (e.discarded) continue;
      if (e.type === "input_received" && e.turnIndex > max) max = e.turnIndex;
    }
  });
  time("delivered inputId scan", 50, () => {
    const delivered = new Set<string>();
    for (const e of entries) {
      if (e.discarded || e.type !== "user_message") continue;
      const id = (e.meta as Record<string, unknown>)["inputId"];
      if (typeof id === "string") delivered.add(id);
    }
  });
  console.log();
}

console.log("done.");
