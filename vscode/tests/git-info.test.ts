import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readGitBranch } from "../src/git-info.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "fermi-git-test-"));
}

describe("readGitBranch", () => {
  test("reads a normal branch ref", () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/feature/x\n");
    expect(readGitBranch(dir)).toBe("feature/x");
  });

  test("returns a short hash for a detached HEAD", () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "0123456789abcdef0123456789abcdef01234567\n");
    expect(readGitBranch(dir)).toBe("01234567");
  });

  test("follows a worktree-style .git file", () => {
    const main = tempDir();
    const wt = tempDir();
    const gitdir = join(main, "worktree-git");
    mkdirSync(gitdir, { recursive: true });
    writeFileSync(join(gitdir, "HEAD"), "ref: refs/heads/main-fermi\n");
    writeFileSync(join(wt, ".git"), `gitdir: ${gitdir}\n`);
    expect(readGitBranch(wt)).toBe("main-fermi");
  });

  test("returns null for non-repos", () => {
    expect(readGitBranch(tempDir())).toBeNull();
  });
});
