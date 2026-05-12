/**
 * OSC 52 clipboard fallback.
 *
 * Writes text into the terminal emulator's clipboard via the OSC 52
 * escape sequence. Supported by most modern terminals (kitty, wezterm,
 * iTerm2, alacritty with config, recent gnome-terminal, tmux 2.6+
 * with `set -g set-clipboard on`).
 *
 * Used as a tail of the dispatch chain on Linux (when wl-copy/xclip
 * are missing) and as a graceful degradation everywhere.
 *
 * Cannot read the clipboard — the protocol is write-only from the
 * application side without a cooperating terminal, which essentially
 * never works in practice.
 */

import type { ClipboardImage, ClipboardProvider } from "../types.js";

export const osc52Clipboard: ClipboardProvider = {
  id: "osc52",

  async writeText(text: string): Promise<boolean> {
    try {
      // Encode payload as base64; OSC 52 is `\x1b]52;c;<base64>\x07`.
      // `c` selects the system clipboard. We deliberately write to
      // stderr so the sequence doesn't get mingled with subprocess
      // stdout in pipelines.
      const payload = Buffer.from(text, "utf8").toString("base64");
      process.stderr.write(`\x1b]52;c;${payload}\x07`);
      return true;
    } catch {
      return false;
    }
  },

  async readImage(): Promise<ClipboardImage | null> {
    // OSC 52 is write-only in practice.
    return null;
  },
};
