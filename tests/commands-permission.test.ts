import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, mock } from "bun:test";
import {
  buildDefaultRegistry,
  type CommandContext,
} from "../src/commands.js";

function baseContext(registry: ReturnType<typeof buildDefaultRegistry>): CommandContext {
  return {
    session: {},
    showMessage: mock(),
    autoSave: mock(),
    resetUiState: mock(),
    commandRegistry: registry,
  };
}

describe("/permission command", () => {
  it("persists permission mode to settings.json for bootstrap reloads", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "fermi-permission-"));
    try {
      const registry = buildDefaultRegistry();
      const cmd = registry.lookup("/permission");
      expect(cmd).toBeTruthy();

      const session = { permissionMode: "reversible" };
      const ctx: CommandContext = {
        ...baseContext(registry),
        session,
        fermiHomeDir: homeDir,
      };

      await cmd!.handler(ctx, "yolo");

      expect(session.permissionMode).toBe("yolo");
      const settings = JSON.parse(readFileSync(join(homeDir, "settings.json"), "utf-8"));
      expect(settings.permission_mode).toBe("yolo");
      expect(existsSync(join(homeDir, "tui-preferences.json"))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

describe("/permissions command", () => {
  it("only audits rules and revokes approval-generated grants", async () => {
    const registry = buildDefaultRegistry();
    const cmd = registry.lookup("/permissions");
    expect(cmd).toBeTruthy();

    const addRule = mock();
    const revokeRule = mock(() => true);
    let shownOptions: Array<{ label: string; value: string; detail?: string }> = [];
    const ctx: CommandContext = {
      ...baseContext(registry),
      session: {
        permissionRuleStore: {
          getAllRules: () => [
            {
              id: "p_allow",
              type: "tool_pattern",
              action: "allow",
              tool: "bash",
              pattern: "git push",
              scope: "project",
              createdAt: 0,
            },
            {
              id: "g_deny",
              type: "tool_pattern",
              action: "deny",
              tool: "web_fetch",
              scope: "global",
              createdAt: 0,
            },
          ],
          getLoadErrors: () => [],
          revokeRule,
          addRule,
        },
      },
      promptCommandPicker: mock(async (options) => {
        shownOptions = options;
        return undefined;
      }),
    };

    await cmd!.handler(ctx, "");

    expect(shownOptions.some((option) => option.label.includes("Add deny"))).toBe(false);
    expect(shownOptions.find((option) => option.label.includes("allow"))?.value).toBe("revoke:p_allow");
    expect(shownOptions.find((option) => option.label.includes("deny"))?.value).toBe("file-managed:global");

    await cmd!.handler(ctx, "deny bash git push");
    expect(addRule).not.toHaveBeenCalled();
    expect(ctx.showMessage).toHaveBeenLastCalledWith("Usage: /permissions [list | revoke <id>]");

    await cmd!.handler(ctx, "revoke g_deny");
    expect(revokeRule).not.toHaveBeenCalled();
    expect(ctx.showMessage).toHaveBeenLastCalledWith(
      "Rule g_deny is file-managed; edit its permissions.json instead.",
    );
  });
});
