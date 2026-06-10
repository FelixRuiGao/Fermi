import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, mock } from "bun:test";

import {
  buildDefaultRegistry,
  type CommandContext,
} from "../src/commands.js";

function makeSessionStub(): {
  session: Record<string, unknown>;
  setCalls: Array<Record<string, unknown>>;
} {
  const setCalls: Array<Record<string, unknown>> = [];
  const state = { enabled: true, level1: 50, level2: 75 };
  const session = {
    getSummarizeHintConfig: () => ({ ...state }),
    setSummarizeHintConfig: (config: { enabled?: boolean; level1?: number; level2?: number }) => {
      setCalls.push({ ...config });
      if (config.enabled !== undefined) state.enabled = config.enabled;
      if (config.level1 !== undefined) state.level1 = config.level1;
      if (config.level2 !== undefined) state.level2 = config.level2;
    },
  };
  return { session, setCalls };
}

function makeContext(
  registry: ReturnType<typeof buildDefaultRegistry>,
  session: Record<string, unknown>,
  homeDir: string,
): { ctx: CommandContext; showMessage: ReturnType<typeof mock> } {
  const showMessage = mock();
  const ctx: CommandContext = {
    session: session as never,
    showMessage,
    autoSave: mock(),
    resetUiState: mock(),
    commandRegistry: registry,
    fermiHomeDir: homeDir,
  };
  return { ctx, showMessage };
}

describe("/summarize_hint command", () => {
  it("shows current status without arguments", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-shint-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/summarize_hint");
      expect(cmd).toBeTruthy();

      const { session, setCalls } = makeSessionStub();
      const { ctx, showMessage } = makeContext(registry, session, homeDir);

      await cmd!.handler(ctx, "");

      const rendered = showMessage.mock.calls[0]?.[0] as string;
      expect(rendered).toContain("on");
      expect(rendered).toContain("level1 50%");
      expect(rendered).toContain("level2 75%");
      expect(setCalls).toHaveLength(0);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("turns hints off, persists, and applies live", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-shint-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/summarize_hint");
      const { session, setCalls } = makeSessionStub();
      const { ctx } = makeContext(registry, session, homeDir);

      await cmd!.handler(ctx, "off");

      expect(setCalls).toEqual([{ enabled: false }]);
      const settings = JSON.parse(readFileSync(join(homeDir, "settings.json"), "utf-8"));
      expect(settings.summarize_hint).toEqual({ enabled: false, level1: 50, level2: 75 });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("sets valid levels, persists, and applies live", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-shint-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/summarize_hint");
      const { session, setCalls } = makeSessionStub();
      const { ctx } = makeContext(registry, session, homeDir);

      await cmd!.handler(ctx, "40 70");

      expect(setCalls).toEqual([{ level1: 40, level2: 70 }]);
      const settings = JSON.parse(readFileSync(join(homeDir, "settings.json"), "utf-8"));
      expect(settings.summarize_hint).toEqual({ enabled: true, level1: 40, level2: 70 });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("opens a picker without arguments and applies the choice", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-shint-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/summarize_hint");
      expect(cmd!.options).toBeTruthy();

      const { session, setCalls } = makeSessionStub();
      const { ctx } = makeContext(registry, session, homeDir);
      const promptCommandPicker = mock(async (options: Array<{ label: string; value: string; customInput?: boolean }>) => {
        expect(options.map((o) => o.value)).toEqual(["on", "off", "levels"]);
        expect(options[0].label).toContain("(current)");
        expect(options[2].customInput).toBe(true);
        return { value: "off" };
      });
      (ctx as Record<string, unknown>).promptCommandPicker = promptCommandPicker;

      await cmd!.handler(ctx, "");
      expect(promptCommandPicker).toHaveBeenCalledTimes(1);
      expect(setCalls).toEqual([{ enabled: false }]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("accepts levels typed through the picker's custom input", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-shint-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/summarize_hint");
      const { session, setCalls } = makeSessionStub();
      const { ctx } = makeContext(registry, session, homeDir);
      (ctx as Record<string, unknown>).promptCommandPicker = mock(async () => ({ value: "levels", note: "30 60" }));

      await cmd!.handler(ctx, "");
      expect(setCalls).toEqual([{ level1: 30, level2: 60 }]);
      const settings = JSON.parse(readFileSync(join(homeDir, "settings.json"), "utf-8"));
      expect(settings.summarize_hint).toEqual({ enabled: true, level1: 30, level2: 60 });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("rejects invalid levels without persisting", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-shint-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/summarize_hint");
      const { session, setCalls } = makeSessionStub();
      const { ctx, showMessage } = makeContext(registry, session, homeDir);

      await cmd!.handler(ctx, "80 50");
      await cmd!.handler(ctx, "10 90");
      await cmd!.handler(ctx, "1.5 70");

      expect(setCalls).toHaveLength(0);
      for (const call of showMessage.mock.calls) {
        expect(String(call[0])).toContain("Invalid levels");
      }
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
