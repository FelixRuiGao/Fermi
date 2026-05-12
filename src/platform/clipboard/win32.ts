/**
 * Windows clipboard provider — stub.
 *
 * Real implementation would use clip.exe for text writes and a
 * PowerShell `Get-Clipboard -Format Image` invocation for image
 * reads. Out of scope for the cross-platform migration that
 * introduced this file.
 */

import type { ClipboardImage, ClipboardProvider } from "../types.js";

function notImplemented(method: string): never {
  throw new Error(
    `PlatformNotImplemented: clipboard.${method} on win32 — TODO. ` +
      `See Docs/decisions.md (D3) for the Windows stub policy.`,
  );
}

export const win32Clipboard: ClipboardProvider = {
  id: "win32-stub",

  async writeText(_text: string): Promise<boolean> {
    return notImplemented("writeText");
  },

  async readImage(): Promise<ClipboardImage | null> {
    return notImplemented("readImage");
  },
};
