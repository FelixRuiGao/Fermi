/**
 * Background shell lifecycle manager.
 *
 * Owns spawning, tracking, reading output from, and killing
 * background shell processes.  Extracted from Session to keep
 * the god-file smaller and the responsibility boundary clear.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

import { ToolResult } from "./providers/base.js";
import { SafePathError, safePath } from "./security/path.js";
import { buildBashEnv } from "./tools/basic.js";
import {
  argOptionalInteger,
  argOptionalString,
  argRequiredString,
  argRequiredStringArray,
  toolArgError,
} from "./tools/arg-helpers.js";
import type { MessageEnvelope } from "./session-tree-types.js";

// ── Types ────────────────────────────────────────────────────────────

export interface BackgroundShellEntry {
  id: string;
  process: ChildProcess;
  command: string;
  cwd: string;
  logPath: string;
  startTime: number;
  status: "running" | "exited" | "failed" | "killed";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  readOffset: number;
  recentOutput: string[];
  explicitKill: boolean;
}

export interface BackgroundShellManagerDeps {
  projectRoot: string;
  getSessionArtifactsDir: () => string;
  deliverMessage: (msg: MessageEnvelope) => void;
}

// Per-id retention for archived shell logs. When the model kills a shell
// and starts a new one with the same id, the old log is renamed; we keep
// only the most recent N renames so the directory does not grow without
// bound in long sessions.
//
// Rationale for 8: a typical dev-server restart writes ~200 KB before kill;
// 8 × 200 KB ≈ 1.6 MB max footprint per id. Mirrors the BASH_SPILL_KEEP_LAST
// = 32 convention from src/tools/basic.ts. Tune here if real usage pushes
// well past this size envelope.
const SHELL_ARCHIVE_KEEP_LAST = 8;

// Regex special characters that need escaping when interpolating user input
// (here: shell id) into a RegExp source string.
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

// ── Manager ──────────────────────────────────────────────────────────

export class BackgroundShellManager {
  private _activeShells = new Map<string, BackgroundShellEntry>();
  private _shellCounter = 0;

  private readonly _projectRoot: string;
  private readonly _getSessionArtifactsDir: () => string;
  private readonly _deliverMessage: (msg: MessageEnvelope) => void;

  constructor(deps: BackgroundShellManagerDeps) {
    this._projectRoot = deps.projectRoot;
    this._getSessionArtifactsDir = deps.getSessionArtifactsDir;
    this._deliverMessage = deps.deliverMessage;
  }

  // ── Public queries ─────────────────────────────────────────────────

  hasTrackedShells(): boolean {
    return this._activeShells.size > 0;
  }

  hasRunningShells(): boolean {
    for (const entry of this._activeShells.values()) {
      if (entry.status === "running") return true;
    }
    return false;
  }

  /**
   * Read-only snapshot of the tracked entry for `id`. Returns null when the
   * id is not tracked. Use this from outside the manager (UI, tests) when
   * you need to look at a shell's status / log path without poking the
   * private map. The returned object MUST NOT be mutated — treat as a
   * structural read.
   */
  getShellEntry(id: string): Readonly<BackgroundShellEntry> | null {
    return this._activeShells.get(id) ?? null;
  }

  buildShellReport(): string {
    if (this._activeShells.size === 0) {
      return "No shells tracked.";
    }

    const renderEntry = (id: string, entry: BackgroundShellEntry): string => {
      const elapsedSec = ((performance.now() - entry.startTime) / 1000).toFixed(1);
      let line = `- [${id}] ${entry.status} (${elapsedSec}s)`;
      if (entry.status === "exited" || entry.status === "failed") {
        line += ` | exit=${entry.exitCode ?? "?"}`;
      } else if (entry.status === "killed") {
        line += ` | signal=${entry.signal ?? "TERM"}`;
      }
      line += ` | log: ${entry.logPath}`;
      if (entry.recentOutput.length > 0) {
        line += `\n    recent: ${entry.recentOutput.join(" → ")}`;
      }
      return line;
    };

    // Split into running vs terminated so the model can't confuse a dead
    // shell's stale entry with a live one. Terminated entries are still
    // useful (logs remain readable) but they aren't "shells the agent can
    // expect to keep producing output."
    const running: string[] = [];
    const terminated: string[] = [];
    for (const [id, entry] of this._activeShells) {
      if (entry.status === "running") {
        running.push(renderEntry(id, entry));
      } else {
        terminated.push(renderEntry(id, entry));
      }
    }

    const out: string[] = [];
    if (running.length > 0) {
      out.push("Running:");
      out.push(...running);
    }
    if (terminated.length > 0) {
      if (out.length > 0) out.push("");
      out.push(
        "Terminated (process is gone; logs above remain readable but no new output will arrive):",
      );
      out.push(...terminated);
    }
    return out.join("\n");
  }

  /**
   * Best-effort SIGTERM + clear for all tracked shells.
   * Also resets the shell counter.
   */
  forceKillAll(): void {
    for (const entry of this._activeShells.values()) {
      if (entry.status === "running") {
        entry.explicitKill = true;
        entry.status = "killed";
        entry.signal = "SIGTERM";
        BackgroundShellManager._killGroup(entry, "SIGTERM");
      }
    }
    this._activeShells.clear();
  }

  // ── Kill helpers ───────────────────────────────────────────────────

  /**
   * Send `sig` to the entire process group led by the child shell. Falls
   * back to killing only the immediate child if the group kill fails
   * (e.g. on a platform without process groups). Returns true if the
   * signal was sent successfully through either path.
   *
   * Why this matters: `npm run dev` is `sh -lc "npm run dev"` which forks
   * `npm` which forks `node`/`vite`. Killing only the sh leaves npm and
   * vite as orphans holding the stdout pipe — the parent never sees
   * "close" and `entry.status` stays stuck at "running". Killing the
   * group (sh + npm + vite + workers) terminates the whole tree.
   */
  private static _killGroup(
    entry: BackgroundShellEntry,
    sig: NodeJS.Signals,
  ): boolean {
    const pid = entry.process.pid;
    if (pid != null) {
      try {
        process.kill(-pid, sig);
        return true;
      } catch {
        // Fall through to single-child kill (group kill can fail if the
        // child died between spawn and now, or on platforms / mocks where
        // process groups aren't available).
      }
    }
    try {
      entry.process.kill(sig);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Move a dead shell's log out of the way so a new shell can reuse the id.
   * Returns the archive path on success, or null if there was no log to move.
   *
   * Keeps the last `SHELL_ARCHIVE_KEEP_LAST` archived logs for this id and
   * deletes older ones. Otherwise a long session that repeatedly restarts
   * `dev-server` would accumulate dozens of multi-MB log files in the
   * shells directory.
   */
  private _archiveDeadShellLog(entry: BackgroundShellEntry): string | null {
    if (!existsSync(entry.logPath)) return null;

    const dir = dirname(entry.logPath);
    const idName = basename(entry.logPath, ".log");

    // ISO timestamp + short uuid suffix so two archives created in the
    // same millisecond don't collide on rename.
    const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
    const uniq = randomUUID().slice(0, 4);
    const archived = join(dir, `${idName}.${ts}.${uniq}.log`);

    // Prune older archives for THIS id (other ids' archives are untouched).
    // Best-effort: any error here is ignored so it can't block the rename.
    try {
      const escapedId = idName.replace(REGEX_SPECIAL_CHARS, "\\$&");
      const archivePattern = new RegExp(`^${escapedId}\\..+\\.log$`);
      const entries = readdirSync(dir)
        .filter((name) => archivePattern.test(name))
        .map((name) => {
          const p = join(dir, name);
          try { return { p, mtime: statSync(p).mtimeMs }; }
          catch { return null; }
        })
        .filter((e): e is { p: string; mtime: number } => e !== null)
        .sort((a, b) => a.mtime - b.mtime);
      while (entries.length >= SHELL_ARCHIVE_KEEP_LAST) {
        const oldest = entries.shift();
        if (!oldest) break;
        try { unlinkSync(oldest.p); } catch { /* ignore */ }
      }
    } catch { /* ignore pruning failure */ }

    try {
      renameSync(entry.logPath, archived);
      return archived;
    } catch {
      return null;
    }
  }

  /**
   * Reset the shell counter (called when transient state is cleared).
   */
  resetCounter(): void {
    this._shellCounter = 0;
  }

  // ── Tool executors ─────────────────────────────────────────────────

  execBashBackground(args: Record<string, unknown>): ToolResult {
    const commandArg = argRequiredString("bash_background", args, "command", { nonEmpty: true });
    if (commandArg instanceof ToolResult) return commandArg;
    const cwdArg = argOptionalString("bash_background", args, "cwd");
    if (cwdArg instanceof ToolResult) return cwdArg;
    const idArg = argOptionalString("bash_background", args, "id");
    if (idArg instanceof ToolResult) return idArg;

    const shellId = idArg
      ? this._normalizeShellId(idArg)
      : `shell-${++this._shellCounter}`;
    if (!shellId) {
      return toolArgError("bash_background", "'id' must contain only letters, numbers, '.', '_' or '-'.");
    }
    // Allow reusing the same id once the prior shell at that id has stopped
    // running. Common case: the model kills a dev server, then wants to
    // restart it with the same memorable id ("dev-server"). Archive the
    // prior log so the new shell can write to a fresh file.
    const existing = this._activeShells.get(shellId);
    let archivedLogPath: string | null = null;
    if (existing) {
      if (existing.status === "running") {
        return new ToolResult({
          content:
            `Error: shell '${shellId}' is already tracked and running. ` +
            `Kill it first with kill_shell, or pass a different id.`,
        });
      }
      archivedLogPath = this._archiveDeadShellLog(existing);
      this._activeShells.delete(shellId);
    }

    const cwd = this._resolveShellCwd("bash_background", cwdArg);
    if (cwd instanceof ToolResult) return cwd;

    const logPath = join(this._getShellsDir(), `${shellId}.log`);
    writeFileSync(logPath, "", "utf-8");

    let child: ChildProcess;
    try {
      child = spawn("sh", ["-lc", commandArg], {
        cwd,
        env: buildBashEnv(),
        stdio: ["ignore", "pipe", "pipe"],
        // detached=true puts the child in its own process group so the
        // whole tree can be killed via process.kill(-pid). Without this,
        // killing only the sh leaks npm/vite/etc as orphans.
        detached: true,
      });
    } catch (e) {
      return new ToolResult({ content: `Error: failed to start background shell: ${e}` });
    }

    const entry: BackgroundShellEntry = {
      id: shellId,
      process: child,
      command: commandArg,
      cwd,
      logPath,
      startTime: performance.now(),
      status: "running",
      exitCode: null,
      signal: null,
      readOffset: 0,
      recentOutput: [],
      explicitKill: false,
    };
    this._activeShells.set(shellId, entry);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      this._recordShellChunk(entry, text);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      this._recordShellChunk(entry, text);
    });
    child.on("error", (error) => {
      entry.status = "failed";
      entry.exitCode = 1;
      entry.signal = null;
      this._deliverMessage({
        type: "system_notice", sender: "system", timestamp: Date.now(),
        content: `Background shell '${shellId}' failed to start: ${error}. Use \`bash_output(id="${shellId}")\` to inspect ${logPath}.`,
        tuiVisible: true,
      });
    });
    child.on("close", (code, signal) => {
      entry.exitCode = code;
      // Preserve a kill-signal that was already recorded by kill_shell —
      // close events from orphaned grandchildren may report different
      // signals or null.
      if (entry.signal == null) entry.signal = signal;
      // kill_shell flips status to "killed" synchronously when issued, so
      // the only path that should land here is a natural exit (status
      // still "running"). Use the exit code to choose exited/failed.
      if (entry.status === "running") {
        entry.status = code === 0 ? "exited" : "failed";
      }
      // Skip notification for explicit kills — the kill_shell tool result
      // already reports the outcome synchronously.
      if (entry.explicitKill) return;
      const statusText = entry.status === "exited"
        ? "completed successfully"
        : `failed (exit ${code ?? 1})`;
      this._deliverMessage({
        type: "system_notice", sender: "system", timestamp: Date.now(),
        content: `Background shell '${shellId}' ${statusText}. Use \`bash_output(id="${shellId}")\` to inspect logs at ${logPath}.`,
        tuiVisible: true,
      });
    });

    const archiveNote = archivedLogPath
      ? `\nprevious log (id was reused): ${archivedLogPath}`
      : "";
    return new ToolResult({
      content:
        `Started background shell '${shellId}'.\n` +
        `cwd: ${cwd}\n` +
        `log: ${logPath}${archiveNote}\n` +
        `Use \`bash_output(id="${shellId}")\` to inspect logs and \`await_event(seconds=60)\` to await shell exit.`,
    });
  }

  execBashOutput(args: Record<string, unknown>): ToolResult {
    const idArg = argRequiredString("bash_output", args, "id", { nonEmpty: true });
    if (idArg instanceof ToolResult) return idArg;
    const tailLinesArg = argOptionalInteger("bash_output", args, "tail_lines");
    if (tailLinesArg instanceof ToolResult) return tailLinesArg;
    const maxCharsArg = argOptionalInteger("bash_output", args, "max_chars");
    if (maxCharsArg instanceof ToolResult) return maxCharsArg;

    const entry = this._activeShells.get(idArg);
    if (!entry) {
      return new ToolResult({ content: `Error: shell '${idArg}' not found.` });
    }

    const maxChars = Math.max(500, Math.min(80_000, maxCharsArg ?? 30_000));
    const fullText = existsSync(entry.logPath) ? readFileSync(entry.logPath, "utf-8") : "";
    let body = "";

    if (tailLinesArg !== undefined) {
      const lines = fullText.split("\n");
      body = lines.slice(-Math.max(1, tailLinesArg)).join("\n").trimEnd();
    } else {
      const fullBuffer = Buffer.from(fullText, "utf-8");
      const unread = fullBuffer.subarray(entry.readOffset).toString("utf-8");
      entry.readOffset = fullBuffer.length;
      if (!unread.trim()) {
        body = "(No new output since the last read.)";
      } else if (unread.length > maxChars) {
        const visible = unread.slice(0, maxChars);
        const omittedChars = unread.length - visible.length;
        const omittedLines = unread.slice(visible.length).split("\n").filter(Boolean).length;
        body =
          `${visible.trimEnd()}\n\n` +
          `[Truncated here because unread output exceeded ${maxChars} chars; skipped ${omittedChars.toLocaleString()} chars` +
          (omittedLines > 0 ? ` / ${omittedLines.toLocaleString()} lines` : "") +
          `. Full log: ${entry.logPath}]`;
      } else {
        body = unread.trimEnd();
      }
    }

    // Header signals dead-shell state once; the `status:` field repeats it
    // in machine-readable form. We deliberately don't add a separate
    // warning banner — the actionable guidance ("start a new
    // bash_background to resume") lives in tools.md so dead-state reads
    // don't get pushed below an attention-grabbing block of prose.
    const header = entry.status === "running"
      ? `# Shell Output`
      : `# Shell Output — TERMINATED`;
    return new ToolResult({
      content:
        `${header}\n` +
        `id: ${entry.id}\n` +
        `status: ${entry.status}\n` +
        `log: ${entry.logPath}\n\n` +
        `${body || "(No output yet.)"}`,
    });
  }

  async execKillShell(args: Record<string, unknown>): Promise<ToolResult> {
    const idsArg = argRequiredStringArray("kill_shell", args, "ids");
    if (idsArg instanceof ToolResult) return idsArg;
    const signalArg = argOptionalString("kill_shell", args, "signal");
    if (signalArg instanceof ToolResult) return signalArg;
    const rawSignal = (signalArg?.trim() || "SIGTERM").toUpperCase();
    const signal = (rawSignal.startsWith("SIG") ? rawSignal : `SIG${rawSignal}`) as NodeJS.Signals;

    const KILL_WAIT_MS = 3_000;
    const KILL_FALLBACK_MS = 500;
    const parts: string[] = [];
    const waitPromises: Promise<void>[] = [];

    for (const id of idsArg) {
      const entry = this._activeShells.get(id);
      if (!entry) {
        parts.push(`'${id}': not found.`);
        continue;
      }
      if (entry.status !== "running") {
        parts.push(`'${id}': already ${entry.status}.`);
        continue;
      }

      // Flip status synchronously: callers querying `check_status` (or
      // reusing the id in bash_background) immediately after this call
      // must NOT see a zombie "running" entry. Previously we relied on
      // the close event to update status, but `close` does not fire when
      // descendants of the shell (e.g. npm spawning vite) keep the stdio
      // pipes open after the shell itself exits — and the entry would
      // sit there as "running" forever.
      entry.explicitKill = true;
      entry.status = "killed";
      entry.signal = signal;

      // Send the signal to the entire process group so child/grandchild
      // processes die alongside the shell. This is what makes the close
      // event actually fire on the parent.
      if (!BackgroundShellManager._killGroup(entry, signal)) {
        // Both group kill and single-child kill threw. In practice this
        // means the process is already gone (ESRCH) — we have permission
        // to signal anything we spawned. Leaving status="killed" is the
        // accurate description of the world after the call: there is no
        // running process attached to this entry, regardless of whether
        // the signal actually traveled.
        parts.push(`'${id}': failed to send ${signal} (process likely already gone).`);
        continue;
      }

      const idx = parts.length;
      parts.push(""); // placeholder
      waitPromises.push(
        new Promise<void>((resolve) => {
          // Already exited between dispatch and here? Resolve immediately.
          if (entry.exitCode !== null || entry.process.exitCode !== null) {
            parts[idx] = `'${id}': killed (signal=${signal}).`;
            resolve();
            return;
          }
          const onClose = () => {
            clearTimeout(timer);
            const exit = entry.exitCode;
            parts[idx] = exit != null
              ? `'${id}': killed (signal=${entry.signal ?? signal}, exit=${exit}).`
              : `'${id}': killed (signal=${entry.signal ?? signal}).`;
            resolve();
          };
          const timer = setTimeout(() => {
            entry.process.removeListener("close", onClose);
            BackgroundShellManager._killGroup(entry, "SIGKILL");
            parts[idx] = `'${id}': SIGKILL after ${KILL_WAIT_MS}ms (initial ${signal} did not exit).`;
            entry.process.once("close", () => resolve());
            setTimeout(resolve, KILL_FALLBACK_MS); // fallback if close never fires
          }, KILL_WAIT_MS);
          entry.process.once("close", onClose);
        }),
      );
    }

    await Promise.all(waitPromises);
    return new ToolResult({ content: parts.join(" ") || "No shells specified." });
  }

  // ── Private helpers ────────────────────────────────────────────────

  private _getShellsDir(): string {
    const dir = join(this._getSessionArtifactsDir(), "shells");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private _normalizeShellId(id: string): string | null {
    const trimmed = id.trim();
    if (!trimmed) return null;
    return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : null;
  }

  private _recordShellChunk(entry: BackgroundShellEntry, chunk: string): void {
    if (!chunk) return;
    appendFileSync(entry.logPath, chunk, "utf-8");
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      entry.recentOutput.push(line);
      if (entry.recentOutput.length > 3) entry.recentOutput.shift();
    }
  }

  private _resolveShellCwd(toolName: string, requested?: string): string | ToolResult {
    const trimmed = (requested ?? "").trim();
    if (!trimmed) {
      return this._projectRoot;
    }

    try {
      return safePath({
        baseDir: this._projectRoot,
        requestedPath: trimmed,
        cwd: this._projectRoot,
        mustExist: true,
        expectDirectory: true,
        accessKind: "list",
      }).safePath!;
    } catch (err) {
      if (!(err instanceof SafePathError)) throw err;
      try {
        return safePath({
          baseDir: this._getSessionArtifactsDir(),
          requestedPath: trimmed,
          cwd: this._getSessionArtifactsDir(),
          mustExist: true,
          expectDirectory: true,
          accessKind: "list",
        }).safePath!;
      } catch (inner) {
        if (inner instanceof SafePathError) {
          return new ToolResult({
            content: `Error: invalid arguments for ${toolName}: cwd must stay within the project root or SESSION_ARTIFACTS.`,
          });
        }
        throw inner;
      }
    }
  }
}
