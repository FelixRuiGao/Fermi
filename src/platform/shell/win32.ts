/**
 * Windows shell provider — uses Git For Windows' bash (a.k.a. Git Bash).
 *
 * Rationale: LLMs are trained on bash. Running their commands through
 * cmd.exe or PowerShell means bashisms ([[ ... ]], <( ... ), arrays,
 * etc.) silently fail. Git For Windows ships an MSYS2-backed bash that
 * understands the same syntax used on macOS and Linux, plus the
 * existing tree-sitter-bash permission classifier keeps working
 * unchanged.
 *
 * Detection strategy (mirrors opencode's approach):
 *   1. `FERMI_RESOLVED_PATH` env override (advanced users / CI)
 *   2. Locate `git.exe` on PATH, then probe `<git-dir>/../../bin/bash.exe`
 *   3. Probe well-known install paths under Program Files
 *
 * If none of those find a bash, we throw at module load with a clear
 * message rather than fall back to cmd/PowerShell. A bashism-rich LLM
 * running through cmd is worse UX than a clean "install Git for
 * Windows" prompt.
 *
 * Process-tree termination uses `taskkill /T /F /PID <pid>`, which
 * walks the descendant tree by parent-pid relationships.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ShellProvider, ShellSpawnRequest } from "../types.js";

// Windows-specific env allowlist. The "user-shell-needs-these" set is
// different from POSIX — there's no SSH_AUTH_SOCK or DBus equivalent
// here, but Windows tools rely on a handful of system paths that we
// must forward (otherwise running `git` or `npm` blows up because they
// can't find their installation roots).
const WIN32_ENV_ALLOWLIST = new Set([
  // Core paths
  "PATH", "PATHEXT", "HOME",
  // Windows installation roots
  "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "PROGRAMW6432",
  "COMSPEC",
  // User locations
  "USERPROFILE", "HOMEPATH", "HOMEDRIVE",
  "APPDATA", "LOCALAPPDATA",
  // Temp
  "TEMP", "TMP", "TMPDIR",
  // Locale / terminal
  "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES",
  "TERM", "COLORTERM", "TZ",
  // Color / CI
  "NO_COLOR", "FORCE_COLOR", "CI",
  // Username / login (some tools read these)
  "USER", "USERNAME", "LOGONSERVER",
  // MSYS2 / Git Bash signalling (Fermi launched from Git Bash inherits
  // these; passing them through keeps the child's bash consistent)
  "MSYSTEM", "MSYS", "MSYS2_ARG_CONV_EXCL", "SHELL",
]);

function detectGitBash(): string | null {
  // 1. Explicit override
  const override = process.env["FERMI_GIT_BASH_PATH"];
  if (override && existsSync(override)) return override;

  // 2. git.exe on PATH → derive <git-dir>/../../bin/bash.exe.
  //    `where git` returns the first match; we take that, then walk up
  //    two levels (typical layout: C:\Program Files\Git\cmd\git.exe →
  //    C:\Program Files\Git\bin\bash.exe).
  try {
    const result = spawnSync("where", ["git"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0 && typeof result.stdout === "string") {
      const gitPath = result.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      if (gitPath) {
        const gitRoot = dirname(dirname(gitPath));
        const candidate = join(gitRoot, "bin", "bash.exe");
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // `where` may fail under unusual environments; fall through to
    // path probing.
  }

  // 3. Common install locations
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  if (process.env["PROGRAMFILES"]) {
    candidates.push(join(process.env["PROGRAMFILES"], "Git", "bin", "bash.exe"));
  }
  if (process.env["PROGRAMFILES(X86)"]) {
    candidates.push(join(process.env["PROGRAMFILES(X86)"], "Git", "bin", "bash.exe"));
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  return null;
}

// Only resolve Git Bash when actually running on Windows. The module
// is statically imported by shell/index.ts on every platform; running
// the probe on macOS/Linux would needlessly hit `where git` and the
// throw below would prevent the runtime from even reaching the
// posixShell selector.
function resolveOrThrow(): string {
  if (process.platform !== "win32") {
    // Deliberately not a real path. shell/index.ts only returns this
    // provider on win32, so nothing should ever read `path` here on
    // macOS/Linux. If something accidentally does, the value below
    // self-identifies in the resulting ENOENT and is grep-friendly.
    return "win32-shell-not-active-on-this-platform";
  }
  const found = detectGitBash();
  if (!found) {
    // Fail loud at module load. The diagnostic at first use would
    // otherwise surface deep inside a tool invocation, far from the
    // root cause.
    throw new Error(
      "Fermi on Windows requires Git for Windows (bash.exe). " +
        "Install from https://git-scm.com/download/win, " +
        "or set FERMI_GIT_BASH_PATH to your bash.exe location.",
    );
  }
  return found;
}

const RESOLVED_PATH: string = resolveOrThrow();

function buildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    // Windows env names are case-insensitive — we compare uppercase.
    const upper = key.toUpperCase();
    if (WIN32_ENV_ALLOWLIST.has(upper) || upper.startsWith("LC_")) {
      env[key] = value;
    }
  }
  if (!env["PATH"]) {
    // Last-resort PATH if the parent process had none. Git Bash's own
    // /usr/bin sits alongside bash.exe.
    env["PATH"] = "C:\\Windows\\System32;C:\\Windows";
  }
  return env;
}

export const win32Shell: ShellProvider = {
  path: RESOLVED_PATH,

  spawn(request: ShellSpawnRequest): ChildProcess {
    const flag = request.loginShell ? "-lc" : "-c";
    return spawn(RESOLVED_PATH, [flag, request.command], {
      cwd: request.cwd,
      env: request.env ?? buildEnv(),
      stdio: request.stdio ?? ["pipe", "pipe", "pipe"],
      // Windows has no process groups in the POSIX sense; killTree
      // uses taskkill /T /F instead. `detached` isn't useful here.
      windowsHide: true,
    });
  },

  killTree(child: ChildProcess, signal: NodeJS.Signals): void {
    const pid = child.pid;
    if (pid != null) {
      try {
        // /T walks the descendant tree by parent-pid. /F forces
        // termination — only added when the caller asked for SIGKILL.
        // Without /F, taskkill sends WM_CLOSE and lets each process
        // shut down cooperatively, which is the closest Windows
        // analogue to SIGTERM. Run synchronously so the caller can
        // rely on the tree being signalled before return.
        const force = signal === "SIGKILL" ? ["/F"] : [];
        spawnSync("taskkill", ["/PID", String(pid), "/T", ...force], {
          stdio: "ignore",
          windowsHide: true,
        });
        return;
      } catch {
        // Fall through to a direct child.kill — handles mocks and the
        // rare case where taskkill itself is unavailable.
      }
    }
    try { child.kill(signal); } catch {}
  },

  buildChildEnv: buildEnv,
};
