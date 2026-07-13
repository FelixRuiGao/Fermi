import {
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, it } from "bun:test";

import { createToolCall } from "../src/log-entry.js";
import { classifyToolAsync } from "../src/permissions/classify.js";
import { evaluatePathAccess } from "../src/permissions/path-access.js";
import { osCapabilities } from "../src/platform/index.js";
import type { OsCapabilities } from "../src/platform/types.js";
import { safePath } from "../src/security/path.js";
import { recordWorkspaceTrustDecision } from "../src/security/workspace-trust.js";
import { extractCdTargetForBash } from "../src/tools/basic.js";
import { makeScriptedSession } from "./helpers/session-harness.js";

const WIN32_CAPS: OsCapabilities = {
  ...osCapabilities,
  supportsPosixPermissions: false,
  caseInsensitiveFilesystem: true,
  platformSpecificDangerCommands: new Set(["reg", "bcdedit", "netsh", "taskkill", "wmic"]),
  platformSpecificCatastrophicCommands: new Set(["format", "diskpart"]),
  strippableExecutableExtensions: [".exe", ".cmd", ".bat", ".com", ".ps1"],
  scriptShimsRequireShell: true,
};

describe("review follow-up command classification", () => {
  it("preserves stdbuf's real inner command for attached and separated modes", async () => {
    const catastrophic = await classifyToolAsync(
      "bash", { command: "stdbuf -o0 rm -rf /" }, process.cwd(), "bash",
    );
    const read = await classifyToolAsync(
      "bash", { command: "stdbuf -oL grep foo" }, process.cwd(), "bash",
    );
    const separated = await classifyToolAsync(
      "bash", { command: "stdbuf -o 0 rm -rf /" }, process.cwd(), "bash",
    );

    expect(catastrophic.permissionClass).toBe("catastrophic");
    expect(read.permissionClass).toBe("read");
    expect(separated.permissionClass).toBe("catastrophic");
  });

  it("only treats the home root itself as an rm catastrophe", async () => {
    const child = await classifyToolAsync(
      "bash", { command: "rm -rf $HOME/subdir" }, process.cwd(), "bash",
    );
    const root = await classifyToolAsync(
      "bash", { command: "rm -rf $HOME" }, process.cwd(), "bash",
    );

    expect(child.permissionClass).toBe("write_danger");
    expect(root.permissionClass).toBe("catastrophic");
  });

  it("normalizes combined and attached-value Git risk flags", async () => {
    const checkout = await classifyToolAsync(
      "bash", { command: "git checkout -qf main" }, process.cwd(), "bash",
    );
    const push = await classifyToolAsync(
      "bash", { command: "git push --force-with-lease=main" }, process.cwd(), "bash",
    );

    expect(checkout.permissionClass).toBe("write_danger");
    expect(checkout.canonicalPattern).toBe("git checkout -f");
    expect(push.permissionClass).toBe("write_danger");
    expect(push.canonicalPattern).toBe("git push --force-with-lease");
  });

  it("does not trust path-qualified PowerShell binaries with safe basenames", async () => {
    for (const command of [
      "C:\\tmp\\Get-Content.exe secret.txt",
      ".\\cat.exe secret.txt",
    ]) {
      const assessment = await classifyToolAsync(
        "bash", { command }, process.cwd(), "pwsh", WIN32_CAPS,
      );
      expect(assessment.permissionClass, command).toBe("write_potent");
      expect(assessment.canMemoize, command).toBe(false);
    }
  });
});

describe("review follow-up trust and path behavior", () => {
  it("invalidates live workspace allow rules when the trusted digest changes", () => {
    const harness = makeScriptedSession();
    try {
      const fermiDir = join(harness.projectRoot, ".fermi");
      const permissionsFile = join(fermiDir, "permissions.json");
      mkdirSync(fermiDir, { recursive: true });
      const writeAllow = (tool: string): void => {
        writeFileSync(permissionsFile, JSON.stringify({
          version: 1,
          rules: [{
            id: "workspace-allow",
            type: "tool_pattern",
            action: "allow",
            tool,
            scope: "workspace",
            createdAt: 0,
          }],
        }));
      };

      writeAllow("bash");
      const initial = harness.session.refreshWorkspaceTrust();
      recordWorkspaceTrustDecision(
        harness.internals._store.projectDir,
        initial.digest!,
        "trusted",
      );
      expect(harness.session.refreshWorkspaceTrust().status).toBe("trusted");

      writeAllow("kill_agent");
      const match = harness.session.permissionRuleStore.findMatching({
        permissionClass: "write_reversible",
        toolName: "kill_agent",
      });
      expect(match.allow).toBeNull();
      expect(harness.session.workspaceTrust.status).toBe("untrusted");
    } finally {
      harness.dispose();
    }
  });

  it("resolves dangling symlink components before judging externality", () => {
    const root = join(tmpdir(), `fermi-dangling-root-${process.pid}-${Math.random()}`);
    const external = join(tmpdir(), `fermi-dangling-target-${process.pid}-${Math.random()}`);
    mkdirSync(root, { recursive: true });
    try {
      symlinkSync(external, join(root, "link"), "dir");
      const access = evaluatePathAccess("link/new.txt", { projectRoot: root });
      expect(access.isExternal).toBe(true);
      expect(access.crossesSymlink).toBe(true);
      expect(access.canonicalPath).toBe(join(realpathSync(tmpdir()), basename(external), "new.txt"));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("tracks PreToolUse per concrete tool-call entry when provider IDs repeat", async () => {
    const harness = makeScriptedSession();
    try {
      harness.session.hookRuntime.setHooks([{
        name: "preflight-counter",
        event: "PreToolUse",
        type: "command",
        command: "true",
      } as never]);
      let hookCalls = 0;
      (harness.session.hookRuntime as any).evaluate = async () => {
        hookCalls++;
        return { decision: "allow" };
      };

      const appendCall = (entryId: string): void => {
        harness.internals._appendEntry(createToolCall(
          entryId,
          0,
          0,
          "read",
          { id: "reused", name: "read_file", arguments: { path: harness.projectRoot } },
          { toolCallId: "reused", toolName: "read_file", agentName: "Primary" },
        ), false);
      };
      const preflight = () => harness.internals._beforeToolExecute({
        agentName: "Primary",
        toolName: "read_file",
        toolArgs: { path: harness.projectRoot },
        toolCallId: "reused",
        summary: "read",
      });

      appendCall("tc-first");
      await preflight();
      appendCall("tc-second");
      await preflight();
      expect(hookCalls).toBe(2);
    } finally {
      harness.dispose();
    }
  });

  it("extracts quoted and escaped cd targets for mutation tracking", () => {
    expect(extractCdTargetForBash('cd "my dir"')).toBe("my dir");
    expect(extractCdTargetForBash("cd 'other dir'")).toBe("other dir");
    expect(extractCdTargetForBash("cd my\\ dir")).toBe("my dir");
    expect(extractCdTargetForBash('cd -P -- "my dir"')).toBe("my dir");
  });
});

describe("second-pass review fixes", () => {
  it("keeps detailed classification for first-party module-qualified cmdlets", async () => {
    const wipe = await classifyToolAsync(
      "bash",
      { command: "Microsoft.PowerShell.Management\\Remove-Item -Recurse -Force C:\\" },
      process.cwd(), "pwsh", WIN32_CAPS,
    );
    expect(wipe.permissionClass).toBe("catastrophic");

    const read = await classifyToolAsync(
      "bash",
      { command: "Microsoft.PowerShell.Management\\Get-Content file.txt" },
      process.cwd(), "pwsh", WIN32_CAPS,
    );
    expect(read.permissionClass).toBe("read");

    // An unknown module prefix could be a relative directory on the
    // target machine — it keeps the path-qualified floor.
    const unknownPrefix = await classifyToolAsync(
      "bash",
      { command: "EvilPrefix\\Get-Content file.txt" },
      process.cwd(), "pwsh", WIN32_CAPS,
    );
    expect(unknownPrefix.permissionClass).toBe("write_potent");
  });

  it("parses git short clusters with per-subcommand arity", async () => {
    const commit = await classifyToolAsync(
      "bash", { command: "git commit -amfix" }, process.cwd(), "bash",
    );
    expect(commit.permissionClass).toBe("write_reversible");
    expect(commit.canonicalPattern).toBe("git commit");

    const pickaxe = await classifyToolAsync(
      "bash", { command: "git log -Sconfig" }, process.cwd(), "bash",
    );
    expect(pickaxe.permissionClass).toBe("read");

    const branchCreate = await classifyToolAsync(
      "bash", { command: "git checkout -bfeature main" }, process.cwd(), "bash",
    );
    expect(branchCreate.permissionClass).toBe("write_reversible");
    expect(branchCreate.canonicalPattern).toBe("git checkout");

    // A `-f` that consumed a value is a file argument, not force.
    const configFile = await classifyToolAsync(
      "bash", { command: "git config -f other.cfg user.name" }, process.cwd(), "bash",
    );
    expect(configFile.permissionClass).toBe("read");

    // A cluster letter outside the arity table must not persist a pattern.
    const unknownLetter = await classifyToolAsync(
      "bash", { command: "git commit -Zq" }, process.cwd(), "bash",
    );
    expect(unknownLetter.canMemoize).toBe(false);
  });

  it("treats `..`-prefixed names as internal in the executor too", () => {
    const root = join(tmpdir(), `fermi-dotdot-${process.pid}-${Math.random()}`);
    mkdirSync(join(root, "..data"), { recursive: true });
    try {
      expect(() => safePath({
        baseDir: root,
        requestedPath: join(root, "..data", "file.txt"),
        accessKind: "write",
        allowCreate: true,
      })).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never tracks `cd \"\"` as a home-directory change", () => {
    expect(extractCdTargetForBash('cd ""')).toBe(null);
    expect(extractCdTargetForBash("cd -P")).toBe(homedir());
  });

  it("skips workspace trust evaluation when no workspace rule is considered", () => {
    const harness = makeScriptedSession();
    try {
      let calls = 0;
      const original = harness.session.refreshWorkspaceTrust.bind(harness.session);
      (harness.session as { refreshWorkspaceTrust: () => unknown }).refreshWorkspaceTrust = () => {
        calls++;
        return original();
      };
      harness.session.permissionRuleStore.findMatching({
        permissionClass: "write_reversible",
        toolName: "bash",
      });
      expect(calls).toBe(0);
    } finally {
      harness.dispose();
    }
  });
});
