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

export interface ShellSpawnRequest {
  /** Command string passed via `-c` (POSIX) or `/c` (Windows cmd). */
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
  /** Display name of the resolved shell, e.g. "/bin/bash" or "/bin/sh". */
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
// Aggregate
// --------------------------------------------------------------------

export interface PlatformProviders {
  shell: ShellProvider;
  clipboard: ClipboardProvider;
  browser: BrowserProvider;
  binaryAsset: BinaryAssetProvider;
}
