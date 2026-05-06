import { describe, expect, it } from "bun:test";

import { buildActiveContextView } from "../src/active-context.js";
import {
  createAssistantText,
  createSummary,
  createUserMessage,
  type LogEntry,
} from "../src/log-entry.js";

describe("buildActiveContextView", () => {
  it("inserts summaries where their covered context originally appeared", () => {
    const entries: LogEntry[] = [
      createUserMessage("user-001", 1, "old", "old", "c1"),
      createAssistantText("asst-001", 1, 0, "old reply", "old reply", "c1"),
      createUserMessage("user-002", 2, "new", "new", "c2"),
      createSummary(
        "sum-001",
        3,
        "Summary",
        "Summary",
        "s1",
        ["c1"],
        1,
        { summaryOrigin: "manual", coveredTurnStart: 1, coveredTurnEnd: 1, coversUserMessage: true },
      ),
    ];

    const view = buildActiveContextView(entries);
    expect(view.order).toEqual(["s1", "c2"]);
  });

  it("keeps summary turn spans anchored to the covered range", () => {
    const entries: LogEntry[] = [
      createUserMessage("user-001", 1, "old", "old", "c1"),
      createSummary(
        "sum-001",
        5,
        "Summary",
        "Summary",
        "s1",
        ["c1"],
        1,
        { summaryOrigin: "manual", coveredTurnStart: 1, coveredTurnEnd: 1, coversUserMessage: true },
      ),
      createAssistantText("asst-001", 5, 0, "compressed", "compressed", "s1"),
    ];

    const summaryGroup = buildActiveContextView(entries).groups[0];
    expect(summaryGroup.contextId).toBe("s1");
    expect(summaryGroup.turnStart).toBe(1);
    expect(summaryGroup.turnEnd).toBe(1);
    expect(summaryGroup.entries.map(({ entry }) => entry.id)).toEqual(["sum-001", "asst-001"]);
  });

  it("supports nested summaries that cover earlier summaries", () => {
    const entries: LogEntry[] = [
      createAssistantText("asst-001", 1, 0, "first", "first", "c1"),
      createAssistantText("asst-002", 1, 0, "second", "second", "c2"),
      createSummary(
        "sum-001",
        1,
        "First summary",
        "First summary",
        "s1",
        ["c1"],
        1,
        { summaryOrigin: "agent", coveredTurnStart: 1, coveredTurnEnd: 1, coversUserMessage: false },
      ),
      createSummary(
        "sum-002",
        1,
        "Second summary",
        "Second summary",
        "s2",
        ["s1", "c2"],
        2,
        { summaryOrigin: "agent", coveredTurnStart: 1, coveredTurnEnd: 1, coversUserMessage: false },
      ),
    ];

    const view = buildActiveContextView(entries);
    expect(view.order).toEqual(["s2"]);
  });
});
