import { describe, expect, test } from "bun:test";
import {
  buildBlocks,
  toolViewFromProjection,
  normalizeFileModify,
  diffStats,
  summarizeArgs,
  filterByPrefix,
  isTurnEnd,
  childStatusView,
  isLiveChild,
  liveActivitySummary,
  thinkingTail,
  flattenCatalogSections,
  findCatalogNode,
  modelLeafDescription,
} from "../webview/model.js";
import type { ChildSessionSnapshot, ConversationEntry, ModelCatalogNode } from "../src/types.js";

const user = (text: string): ConversationEntry => ({ kind: "user", text, id: `u-${text}` });
const assistant = (text: string): ConversationEntry => ({ kind: "assistant", text, id: `a-${text}` });
const toolCall = (id: string, toolName = "bash"): ConversationEntry => ({
  kind: "tool_call",
  text: `${toolName} call`,
  id: `tc-${id}`,
  meta: { toolCallId: id, toolName, toolArgs: { command: "ls -la" } },
});
const toolResult = (id: string, text = "ok"): ConversationEntry => ({
  kind: "tool_result",
  text,
  id: `tr-${id}`,
  meta: { toolCallId: id },
});

describe("buildBlocks", () => {
  test("groups consecutive tool calls between prose into one work run", () => {
    const blocks = buildBlocks([
      user("hi"),
      toolCall("1"),
      toolResult("1"),
      toolCall("2"),
      toolResult("2"),
      assistant("done"),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["entry", "work", "entry"]);
    const work = blocks[1] as Extract<(typeof blocks)[number], { type: "work" }>;
    expect(work.items).toHaveLength(2);
    expect(work.items.every((i) => i.type === "tool")).toBe(true);
  });

  test("pairs each tool_result with its call by toolCallId, not adjacency", () => {
    const blocks = buildBlocks([
      toolCall("a"),
      toolCall("b"),
      toolResult("b", "b-result"),
      toolResult("a", "a-result"),
    ]);
    const work = blocks[0] as Extract<(typeof blocks)[number], { type: "work" }>;
    const views = work.items.map((i) => (i.type === "tool" ? i.view : null));
    expect(views[0]?.resultText).toBe("a-result");
    expect(views[1]?.resultText).toBe("b-result");
  });

  test("an error entry breaks the work run", () => {
    const blocks = buildBlocks([
      toolCall("1"),
      toolResult("1"),
      { kind: "error", text: "boom" },
      toolCall("2"),
      toolResult("2"),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["work", "entry", "work"]);
  });

  test("turn-end status entries stay outside work runs", () => {
    const turnEnd: ConversationEntry = {
      kind: "status",
      text: "",
      meta: { turnEndStatus: "completed", elapsedMs: 1200 },
    };
    expect(isTurnEnd(turnEnd)).toBe(true);
    const blocks = buildBlocks([toolCall("1"), toolResult("1"), turnEnd]);
    expect(blocks.map((b) => b.type)).toEqual(["work", "entry"]);
  });

  test("empty non-reasoning work entries and empty statuses are dropped", () => {
    const blocks = buildBlocks([
      { kind: "progress", text: "   " },
      { kind: "status", text: "" },
      user("x"),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("entry");
  });

  test("plain status joins an open work run but stands alone otherwise", () => {
    const inRun = buildBlocks([toolCall("1"), toolResult("1"), { kind: "status", text: "note" }]);
    expect(inRun).toHaveLength(1);
    expect(inRun[0].type).toBe("work");

    const alone = buildBlocks([{ kind: "status", text: "note" }]);
    expect(alone).toHaveLength(1);
    expect(alone[0].type).toBe("entry");
  });
});

describe("toolViewFromProjection", () => {
  test("extracts tool name, summary, and pending state", () => {
    const view = toolViewFromProjection(toolCall("1"));
    expect(view.toolName).toBe("bash");
    expect(view.summary).toBe("ls -la");
    expect(view.pending).toBe(true);
  });

  test("marks errors and prefers fullText for results", () => {
    const result: ConversationEntry = {
      kind: "tool_result",
      text: "short",
      fullText: "full output",
      meta: { toolCallId: "1", isError: true },
    };
    const view = toolViewFromProjection(toolCall("1"), result);
    expect(view.isError).toBe(true);
    expect(view.resultText).toBe("full output");
    expect(view.pending).toBe(false);
  });

  test("derives filePath from file tools and from fileModifyData", () => {
    const edit: ConversationEntry = {
      kind: "tool_call",
      text: "",
      meta: { toolCallId: "e", toolName: "edit_file", toolArgs: { file_path: "src/a.ts" } },
    };
    expect(toolViewFromProjection(edit).filePath).toBe("src/a.ts");

    const withDiff: ConversationEntry = {
      kind: "tool_call",
      text: "",
      meta: {
        toolCallId: "w",
        toolName: "edit_file",
        fileModifyData: { filePath: "src/b.ts", mode: "replace", totalLineCount: 10, hunks: [] },
      },
    };
    expect(toolViewFromProjection(withDiff).filePath).toBe("src/b.ts");
  });
});

describe("normalizeFileModify / diffStats", () => {
  test("counts hunk additions and deletions", () => {
    const d = normalizeFileModify({
      filePath: "x.ts",
      mode: "replace",
      totalLineCount: 100,
      hunks: [
        { startLine: 5, contextBefore: [], deletions: ["a", "b"], additions: ["c"], contextAfter: [] },
        { startLine: 20, contextBefore: [], deletions: [], additions: ["d", "e"], contextAfter: [] },
      ],
    });
    expect(d).not.toBeNull();
    expect(diffStats(d!)).toEqual({ added: 3, removed: 2 });
  });

  test("write mode falls back to writeLines count", () => {
    const d = normalizeFileModify({
      filePath: "new.ts",
      mode: "write",
      totalLineCount: 0,
      hunks: [],
      writeLines: ["l1", "l2", "l3"],
    });
    expect(diffStats(d!)).toEqual({ added: 3, removed: 0 });
  });

  test("rejects payloads without a filePath", () => {
    expect(normalizeFileModify({ mode: "write" })).toBeNull();
    expect(normalizeFileModify(null)).toBeNull();
    expect(normalizeFileModify("nope")).toBeNull();
  });
});

describe("summarizeArgs", () => {
  test("truncates long bash commands", () => {
    const long = "x".repeat(150);
    const s = summarizeArgs("bash", { command: long });
    expect(s.length).toBeLessThanOrEqual(101);
    expect(s.endsWith("…")).toBe(true);
  });

  test("falls through common argument names", () => {
    expect(summarizeArgs("web_search", { query: "hi" })).toBe("hi");
    expect(summarizeArgs("read_file", { file_path: "a.ts" })).toBe("a.ts");
    expect(summarizeArgs("anything", { url: "https://x" })).toBe("https://x");
    expect(summarizeArgs("anything", {})).toBe("");
  });
});

describe("filterByPrefix", () => {
  const cmds = [{ name: "/model" }, { name: "/mode" }, { name: "/mcp" }, { name: "/help" }];

  test("empty or bare slash returns everything", () => {
    expect(filterByPrefix(cmds, "")).toHaveLength(4);
    expect(filterByPrefix(cmds, "/")).toHaveLength(4);
  });

  test("prefix narrows case-insensitively", () => {
    expect(filterByPrefix(cmds, "/mo").map((c) => c.name)).toEqual(["/model", "/mode"]);
    expect(filterByPrefix(cmds, "/MODEL").map((c) => c.name)).toEqual(["/model"]);
    expect(filterByPrefix(cmds, "/zzz")).toHaveLength(0);
  });
});

describe("live activity view model", () => {
  const child = (over: Partial<ChildSessionSnapshot>): ChildSessionSnapshot => ({
    id: "c1",
    numericId: 1,
    logRevision: 0,
    template: "explorer",
    mode: "oneshot",
    lifecycle: "running",
    phase: "thinking",
    outcome: "none",
    running: true,
    lifetimeToolCallCount: 0,
    lastTotalTokens: 0,
    lastToolCallSummary: "",
    recentEvents: [],
    pendingInboxCount: 0,
    lastActivityAt: 0,
    inputTokens: 0,
    contextBudget: 0,
    modelConfigName: "m",
    modelProvider: "p",
    activeLogEntryId: null,
    turnElapsed: 0,
    cacheReadTokens: 0,
    ...over,
  });

  test("childStatusView maps phases to readable labels", () => {
    expect(childStatusView(child({ phase: "tool_calling", lifetimeToolCallCount: 5, lastToolCallSummary: "grep foo" })))
      .toEqual({
        id: "c1",
        label: "#1 explorer",
        phase: "running tools",
        needsApproval: false,
        toolCount: 5,
        detail: "grep foo",
      });
  });

  test("a pending ask overrides the phase", () => {
    const v = childStatusView(child({ pendingAskId: "ask-1", pendingAskKind: "approval" }));
    expect(v.phase).toBe("needs approval");
    expect(v.needsApproval).toBe(true);
  });

  test("isLiveChild: running/blocked live, idle/archived not", () => {
    expect(isLiveChild(child({ lifecycle: "running" }))).toBe(true);
    expect(isLiveChild(child({ lifecycle: "blocked" }))).toBe(true);
    expect(isLiveChild(child({ lifecycle: "idle" }))).toBe(false);
    expect(isLiveChild(child({ lifecycle: "archived" }))).toBe(false);
  });

  test("liveActivitySummary pluralizes and joins", () => {
    expect(liveActivitySummary(1, 0)).toBe("1 agent");
    expect(liveActivitySummary(2, 1)).toBe("2 agents · 1 shell");
    expect(liveActivitySummary(0, 3)).toBe("3 shells");
  });
});

describe("thinkingTail", () => {
  test("keeps the last lines of a long stream", () => {
    const text = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const tail = thinkingTail(text, 8, 700);
    expect(tail.startsWith("line 12")).toBe(true);
    expect(tail.endsWith("line 19")).toBe(true);
  });

  test("caps by characters even within the line window", () => {
    const text = "x".repeat(2000);
    expect(thinkingTail(text, 8, 700).length).toBe(700);
  });
});

describe("model catalog view model", () => {
  const leaf = (over: Partial<ModelCatalogNode>): ModelCatalogNode => ({
    kind: "model",
    id: over.value ?? "p:m",
    value: over.value ?? "p:m",
    label: over.label ?? "Model",
    isCurrent: false,
    credentialState: "configured",
    keyMissing: false,
    ...over,
  });

  const catalog: ModelCatalogNode[] = [
    {
      kind: "provider", id: "anthropic", value: "anthropic", label: "Anthropic",
      isCurrent: false, credentialState: "configured", keyMissing: false,
      children: [
        leaf({ value: "anthropic:claude-haiku-4-5", label: "Claude Haiku 4.5", brandLabel: "Anthropic", contextLength: 199680, isCurrent: true }),
        leaf({ value: "anthropic:claude-opus-4-7", label: "Claude Opus 4.7", brandLabel: "Anthropic", contextLength: 199680 }),
      ],
    },
    {
      kind: "group", id: "kimi", value: "kimi", label: "Kimi",
      isCurrent: false, credentialState: "missing", keyMissing: true,
      children: [
        {
          kind: "provider", id: "moonshot", value: "moonshot", label: "Moonshot",
          isCurrent: false, credentialState: "missing", keyMissing: true,
          children: [leaf({ value: "moonshot:kimi-k2", label: "Kimi K2", brandLabel: "Moonshot", keyMissing: true, credentialState: "missing", credentialHint: "key missing: run fermi init" })],
        },
      ],
    },
  ];

  test("flattenCatalogSections groups model leaves under their provider label", () => {
    const sections = flattenCatalogSections(catalog);
    expect(sections.map((s) => s.label)).toEqual(["Anthropic", "Moonshot"]);
    expect(sections[0].models.map((m) => m.label)).toEqual(["Claude Haiku 4.5", "Claude Opus 4.7"]);
    expect(sections[1].models.map((m) => m.label)).toEqual(["Kimi K2"]);
  });

  test("findCatalogNode descends into children", () => {
    expect(findCatalogNode(catalog, "anthropic:claude-opus-4-7")?.label).toBe("Claude Opus 4.7");
    expect(findCatalogNode(catalog, "moonshot:kimi-k2")?.label).toBe("Kimi K2");
    expect(findCatalogNode(catalog, "nope")).toBeUndefined();
  });

  test("modelLeafDescription combines brand, context, and credential hint", () => {
    expect(modelLeafDescription(catalog[0].children![0])).toBe("Anthropic · 195K");
    const kimi = findCatalogNode(catalog, "moonshot:kimi-k2")!;
    expect(modelLeafDescription(kimi)).toBe("Moonshot · key missing: run fermi init");
  });
});
