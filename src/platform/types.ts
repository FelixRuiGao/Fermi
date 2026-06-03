/**
 * Platform Abstraction Layer — provider interfaces.
 *
 * Defines every cross-platform capability Fermi needs, with one
 * implementation per supported OS in sibling subdirectories.
 *
 * Business code imports the active provider via `src/platform/index.ts`
 * and never branches on `process.platform` directly. Windows
 * implementations are stubs that throw a clear error until they're
 * filled in.
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";

// --------------------------------------------------------------------
// Shell
// --------------------------------------------------------------------

/** Identifies the shell flavour driving the `bash` tool.
 *  Business code uses this to select parser, prompt wording, and
 *  spawn arguments — never raw `process.platform` checks. */
export type ShellKind = "bash" | "sh" | "pwsh" | "powershell";

export interface ShellSpawnRequest {
  /** Command string passed via `-c` (POSIX) or `-Command` (PowerShell). */
  command: string;
  cwd?: string;
  /** Whether to spawn the shell as a login shell (POSIX `-lc`). */
  loginShell?: boolean;
  /** Override the env passed to the child. If omitted, uses the
   *  platform-default allowlist filter of `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Standard SpawnOptions overrides; usually only `stdio` is set by
   *  the caller. The provider handles `detached` and process-group
   *  semantics internally. */
  stdio?: SpawnOptions["stdio"];
}

export interface ShellProvider {
  /** Shell flavour — determines prompt wording, parser, and spawn args. */
  readonly kind: ShellKind;
  /** Absolute path to the resolved shell binary. */
  readonly path: string;

  /**
   * Spawn a command string through the platform's shell. Always
   * returns a ChildProcess whose process tree can be killed via
   * `killTree`.
   */
  spawn(request: ShellSpawnRequest): ChildProcess;

  /**
   * Kill the entire descendant tree of a child spawned by `spawn`.
   * POSIX uses the process-group signal (`process.kill(-pid, sig)`);
   * Windows uses `taskkill /T /F`.
   */
  killTree(child: ChildProcess, signal: NodeJS.Signals): void;

  /** Filter `process.env` through the platform-default allowlist. */
  buildChildEnv(): NodeJS.ProcessEnv;
}

// --------------------------------------------------------------------
// Clipboard
// --------------------------------------------------------------------

export type ClipboardImageMediaType = "image/png" | "image/jpeg" | "image/tiff";

export interface ClipboardImage {
  buffer: Buffer;
  mediaType: ClipboardImageMediaType;
}

export interface ClipboardProvider {
  /** Identifier of the active implementation, for diagnostics. */
  readonly id: string;

  /**
   * Write plain text to the system clipboard. Returns true if the
   * primary mechanism succeeded. Implementations may try multiple
   * tools (e.g. wl-copy → xclip → OSC 52) and report success on the
   * first that works.
   */
  writeText(text: string): Promise<boolean>;

  /**
   * Read an image from the system clipboard. Returns null when the
   * clipboard contains no image, when the required tool is missing,
   * or when the platform does not support clipboard image reads.
   */
  readImage(): Promise<ClipboardImage | null>;
}

// --------------------------------------------------------------------
// Browser / system file opener
// --------------------------------------------------------------------

export interface BrowserProvider {
  /** Open an http(s):// URL in the user's default browser. */
  openUrl(url: string): void;

  /**
   * Open a local file in the system's default application. On
   * darwin/linux/win this routes through the same command used for
   * `openUrl` (`open` / `xdg-open` / `start`).
   */
  openFile(path: string): void;
}

// --------------------------------------------------------------------
// Binary asset (release tarball naming + install paths)
// --------------------------------------------------------------------

export interface BinaryAssetProvider {
  /** e.g. "fermi-darwin-arm64.tar.gz". */
  readonly tarballName: string;
  /** "fermi" on POSIX, "fermi.exe" on Windows. */
  readonly executableName: string;
  /** Whether `xattr -dr com.apple.quarantine` should run after install. */
  readonly needsQuarantineRemoval: boolean;
}

// --------------------------------------------------------------------
// OS capabilities — coarse-grained yes/no flags about what the host OS
// implements. Used by business code to skip operations that don't
// apply on the current platform (e.g. POSIX chmod on Windows). Keeping
// these as boolean flags rather than `process.platform` checks lets
// business code stay platform-agnostic.
// --------------------------------------------------------------------

export interface OsCapabilities {
  /**
   * True on macOS and Linux, false on Windows. POSIX permission bits
   * (chmod, the 0o600 / 0o755 model) only have meaningful semantics
   * on POSIX filesystems. Use this to skip `chmodSync` calls rather
   * than branching on `process.platform === "win32"`.
   */
  readonly supportsPosixPermissions: boolean;

  /**
   * Names of dangerous executables that exist primarily on this
   * platform. Used by the bash command classifier to flag commands
   * the LLM might invoke through the shell.
   *
   * Stored lowercased; the classifier MUST compare against
   * `name.toLowerCase()`. Windows file lookup is case-insensitive,
   * so `REG QUERY ...` from Git Bash resolves to the same `reg.exe`
   * as `reg query ...`; a case-sensitive lookup would let the LLM
   * trivially bypass the danger gate by varying casing.
   *
   * POSIX-shared danger commands (rm, sudo, chmod, ...) stay in
   * `classify.ts` with case-sensitive matching — Unix convention is
   * case-sensitive paths, and a file genuinely named `RM` should not
   * collide with `rm`.
   */
  readonly platformSpecificDangerCommands: ReadonlySet<string>;

  /**
   * Glyph used as the left-side indicator on completed tool-call
   * entries in the TUI.
   *
   * Why a per-platform default: macOS/Linux terminals render U+23FA
   * BLACK CIRCLE FOR RECORD (⏺) as a clean filled circle slightly
   * larger than a bullet, which reads as a deliberate "this is a
   * completed action" marker. Windows PowerShell's default font
   * (Cascadia Mono / Consolas) does not contain U+23FA, so the
   * terminal falls through to Segoe UI Symbol / Emoji and renders
   * the same codepoint as a "record button" icon with a square
   * outline — visually wrong and inconsistent with the bullet next
   * to it. U+2B24 BLACK LARGE CIRCLE (⬤) lives in the geometric
   * shapes block that Cascadia / Consolas ship directly, so on
   * Windows it stays a plain circle.
   */
  readonly toolIndicatorGlyph: string;

  /**
   * Multiplier applied to mouse-wheel delta in the main conversation
   * scroll viewport. 1 on macOS / Linux (terminals typically deliver
   * the user's preferred OS-level scroll acceleration already). 3 on
   * Windows where Windows Terminal / PowerShell deliver a single
   * tick-per-notch raw delta without OS-side acceleration, making
   * the default scrolling feel sluggish compared to native macOS
   * inertia. The value is applied per scroll event by injecting a
   * ConstantScrollAccel into the conversation ScrollViewport.
   */
  readonly conversationScrollMultiplier: number;
}

// --------------------------------------------------------------------
// Aggregate
// --------------------------------------------------------------------

export interface PlatformProviders {
  shell: ShellProvider;
  clipboard: ClipboardProvider;
  browser: BrowserProvider;
  binaryAsset: BinaryAssetProvider;
  osCapabilities: OsCapabilities;
}
