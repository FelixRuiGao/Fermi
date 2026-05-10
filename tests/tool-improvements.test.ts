/**
 * Coverage for the May 2026 basic-tool overhaul:
 *  - read_file:  offset/limit aliases, per-line truncation
 *  - list_dir:   max_depth, max_entries, skipped-default dirs, file size suffix
 *  - glob:       Bun.Glob path, auto `**\/` prefix, limit cap
 *  - grep:       multi-pattern OR, smart-case, per-file limit, output cap
 *  - edit_file:  replace_all, no-op rejection, line-number disambiguation
 *  - bash:       spill-to-file when output exceeds the cap
 *  - web_fetch:  middle-cut truncation (covered indirectly via shared util)
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { executeTool } from "../src/tools/basic.js";
import { truncateMiddle } from "../src/tools/shared.js";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("read_file improvements", () => {
  it("accepts offset/limit aliases for start_line/end_line", async () => {
    const root = makeTempDir("fermi-read-aliases-");
    try {
      const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join("\n");
      writeFileSync(join(root, "a.txt"), lines, "utf-8");

      const r = await executeTool(
        "read_file",
        { path: "a.txt", offset: 5, limit: 3 },
        { projectRoot: root },
      );
      expect(r.content).toContain("line5");
      expect(r.content).toContain("line6");
      expect(r.content).toContain("line7");
      expect(r.content).not.toContain("line8");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("truncates individual lines longer than the per-line cap", async () => {
    const root = makeTempDir("fermi-read-line-trunc-");
    try {
      const huge = "x".repeat(3500);
      writeFileSync(join(root, "big.txt"), `before\n${huge}\nafter\n`, "utf-8");
      const r = await executeTool("read_file", { path: "big.txt" }, { projectRoot: root });
      expect(r.content).toContain("line truncated at 2000 chars");
      expect(r.content).toContain("1 line exceeded 2000 chars");
      expect(r.content).toContain("before");
      expect(r.content).toContain("after");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("list_dir improvements", () => {
  it("renders file size suffixes and applies max_entries", async () => {
    const root = makeTempDir("fermi-list-cap-");
    try {
      // 12 files
      for (let i = 0; i < 12; i++) {
        writeFileSync(join(root, `f${i}.txt`), "hi", "utf-8");
      }
      const r = await executeTool(
        "list_dir",
        { path: ".", max_entries: 5 },
        { projectRoot: root },
      );
      expect(r.content).toContain("[2 B]"); // size suffix
      expect(r.content).toMatch(/Output truncated at 5 entries/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips excluded directories at depth > 0 but inspects them when passed as path", async () => {
    const root = makeTempDir("fermi-list-skip-");
    try {
      mkdirSync(join(root, "node_modules"));
      writeFileSync(join(root, "node_modules", "pkg.json"), "{}", "utf-8");
      writeFileSync(join(root, "main.ts"), "// hi", "utf-8");

      const skipped = await executeTool("list_dir", { path: "." }, { projectRoot: root });
      expect(skipped.content).toContain("main.ts");
      expect(skipped.content).not.toContain("pkg.json");
      expect(skipped.content).toMatch(/Skipped \d+ excluded/);

      const explicit = await executeTool(
        "list_dir",
        { path: "node_modules" },
        { projectRoot: root },
      );
      expect(explicit.content).toContain("pkg.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("glob improvements", () => {
  it("auto-prepends **/ for slashless patterns", async () => {
    const root = makeTempDir("fermi-glob-auto-");
    try {
      mkdirSync(join(root, "nested"));
      writeFileSync(join(root, "nested", "deep.ts"), "//", "utf-8");
      writeFileSync(join(root, "top.ts"), "//", "utf-8");

      const r = await executeTool(
        "glob",
        { pattern: "*.ts" },
        { projectRoot: root },
      );
      // Both files should match because the slashless `*.ts` is auto-prefixed
      // with `**/` to match anywhere in the tree.
      expect(r.content).toContain("top.ts");
      expect(r.content).toContain("deep.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits a truncation notice when results exceed the limit", async () => {
    const root = makeTempDir("fermi-glob-limit-");
    try {
      for (let i = 0; i < 6; i++) {
        writeFileSync(join(root, `f${i}.md`), "x", "utf-8");
      }
      const r = await executeTool(
        "glob",
        { pattern: "*.md", limit: 3 },
        { projectRoot: root },
      );
      expect(r.content).toMatch(/Showing 3 of 6 matches/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("grep improvements", () => {
  it("supports multi-pattern OR with array input", async () => {
    const root = makeTempDir("fermi-grep-multi-");
    try {
      writeFileSync(
        join(root, "a.ts"),
        "loadUser()\nload_user()\nLoadUser()\nunrelated()\n",
        "utf-8",
      );
      const r = await executeTool(
        "grep",
        {
          pattern: ["loadUser", "load_user", "LoadUser"],
          path: ".",
          output_mode: "content",
        },
        { projectRoot: root },
      );
      expect(r.content).toContain("loadUser()");
      expect(r.content).toContain("load_user()");
      expect(r.content).toContain("LoadUser()");
      expect(r.content).not.toContain("unrelated()");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("auto case-insensitive when pattern is all-lowercase (smart case)", async () => {
    const root = makeTempDir("fermi-grep-smartcase-");
    try {
      writeFileSync(join(root, "a.ts"), "FooBar\nfoobar\n", "utf-8");
      const r = await executeTool(
        "grep",
        { pattern: "foobar", path: ".", output_mode: "content" },
        { projectRoot: root },
      );
      expect(r.content).toContain("FooBar");
      expect(r.content).toContain("foobar");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("respects -i: false to force case-sensitive even with lowercase pattern", async () => {
    const root = makeTempDir("fermi-grep-icase-off-");
    try {
      writeFileSync(join(root, "a.ts"), "FooBar\nfoobar\n", "utf-8");
      const r = await executeTool(
        "grep",
        { pattern: "foobar", path: ".", output_mode: "content", "-i": false },
        { projectRoot: root },
      );
      expect(r.content).toContain("foobar");
      expect(r.content).not.toContain("FooBar");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("caps matches per file and surfaces a 'more matches' marker", async () => {
    const root = makeTempDir("fermi-grep-perfile-");
    try {
      const lines = Array.from({ length: 30 }, () => "needle").join("\n");
      writeFileSync(join(root, "a.ts"), lines, "utf-8");
      const r = await executeTool(
        "grep",
        {
          pattern: "needle",
          path: ".",
          output_mode: "content",
          limit_per_file: 5,
        },
        { projectRoot: root },
      );
      expect(r.content).toContain("more matches in this file");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("edit_file improvements", () => {
  it("rejects no-op edits where old_str === new_str", async () => {
    const root = makeTempDir("fermi-edit-noop-");
    try {
      writeFileSync(join(root, "a.txt"), "hello\n", "utf-8");
      const r = await executeTool(
        "edit_file",
        { path: "a.txt", edits: [{ old_str: "hello", new_str: "hello" }] },
        { projectRoot: root },
      );
      expect(r.content).toContain("no-op");
      expect(readFileSync(join(root, "a.txt"), "utf-8")).toBe("hello\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports line numbers of every match when old_str is ambiguous", async () => {
    const root = makeTempDir("fermi-edit-ambig-");
    try {
      writeFileSync(
        join(root, "a.txt"),
        "alpha\nfoo\nbeta\nfoo\ngamma\nfoo\n",
        "utf-8",
      );
      const r = await executeTool(
        "edit_file",
        { path: "a.txt", edits: [{ old_str: "foo", new_str: "bar" }] },
        { projectRoot: root },
      );
      expect(r.content).toContain("appears 3 times");
      // Lines 2, 4, 6 in 1-indexed
      expect(r.content).toMatch(/at lines 2, 4, 6/);
      expect(r.content).toContain("replace_all: true");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("replace_all: true rewrites every occurrence", async () => {
    const root = makeTempDir("fermi-edit-replace-all-");
    try {
      writeFileSync(
        join(root, "a.txt"),
        "alpha\nfoo\nbeta\nfoo\ngamma\nfoo\n",
        "utf-8",
      );
      const r = await executeTool(
        "edit_file",
        {
          path: "a.txt",
          edits: [{ old_str: "foo", new_str: "BAR", replace_all: true }],
        },
        { projectRoot: root },
      );
      expect(r.content).toContain("edits applied");
      const after = readFileSync(join(root, "a.txt"), "utf-8");
      expect(after).toBe("alpha\nBAR\nbeta\nBAR\ngamma\nBAR\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bash spill", () => {
  it("writes the full untruncated output to a temp file when capped", async () => {
    const root = makeTempDir("fermi-bash-spill-proj-");
    const artifacts = makeTempDir("fermi-bash-spill-art-");
    try {
      // Generate ~250KB of stdout — comfortably above the 200K cap.
      const cmd = "yes 'X' | head -n 130000";
      const r = await executeTool(
        "bash",
        { command: cmd, timeout: 30 },
        { projectRoot: root, sessionArtifactsDir: artifacts },
      );
      expect(r.content).toContain("EXIT CODE: 0");
      expect(r.content).toContain("[truncated");
      expect(r.content).toMatch(/Full untruncated output saved to: .+\.log/);
      // The spill file should exist and contain the full output.
      const spillMatch = r.content.match(/saved to: (.+\.log)/);
      expect(spillMatch).not.toBeNull();
      const spillPath = spillMatch![1];
      const spilled = readFileSync(spillPath, "utf-8");
      expect(spilled.length).toBeGreaterThan(200_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(artifacts, { recursive: true, force: true });
    }
  });
});

describe("truncateMiddle", () => {
  it("returns input unchanged when within limit", () => {
    expect(truncateMiddle("abcdef", 100)).toBe("abcdef");
  });

  it("keeps both head and tail when over the limit", () => {
    const input = "A".repeat(50) + "M".repeat(50) + "Z".repeat(50);
    const out = truncateMiddle(input, 40);
    expect(out.startsWith("A")).toBe(true);
    expect(out.endsWith("Z")).toBe(true);
    expect(out).toContain("[truncated");
  });
});
