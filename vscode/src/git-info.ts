import { readFileSync } from "fs";
import { join, isAbsolute } from "path";

/** Read the current git branch without spawning a process. */
export function readGitBranch(workDir: string): string | null {
  try {
    let gitDir = join(workDir, ".git");
    let head: string;
    try {
      head = readFileSync(join(gitDir, "HEAD"), "utf8");
    } catch {
      // .git may be a file pointing elsewhere (worktrees).
      const gitFile = readFileSync(gitDir, "utf8").trim();
      const m = gitFile.match(/^gitdir:\s*(.+)$/);
      if (!m) return null;
      gitDir = isAbsolute(m[1]) ? m[1] : join(workDir, m[1]);
      head = readFileSync(join(gitDir, "HEAD"), "utf8");
    }
    const ref = head.trim().match(/^ref:\s*refs\/heads\/(.+)$/);
    if (ref) return ref[1];
    return head.trim().slice(0, 8);
  } catch {
    return null;
  }
}
