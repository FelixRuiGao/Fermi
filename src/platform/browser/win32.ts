/**
 * Windows browser / system-file opener.
 *
 * `start ""` opens the argument with the registered default
 * application. The empty title is required so the first quoted
 * argument isn't interpreted as the window title.
 *
 * `start` is a cmd.exe builtin, so we have to spawn through cmd.
 */

import { spawn } from "node:child_process";
import type { BrowserProvider } from "../types.js";

function safeOpen(arg: string): void {
  try {
    const child = spawn("cmd", ["/c", "start", "", arg], { stdio: "ignore", detached: true });
    child.on("error", () => { /* ignore */ });
    child.unref();
  } catch {
    // ignore
  }
}

export const win32Browser: BrowserProvider = {
  openUrl: safeOpen,
  openFile: safeOpen,
};
