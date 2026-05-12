/**
 * Windows clipboard provider.
 *
 * Text:  pipe through `clip.exe` (built into Windows since Vista) with
 *        a UTF-16LE byte-order mark so non-ASCII (CJK, emoji, etc.)
 *        survives the round-trip. clip.exe documents this as its
 *        expected encoding for full Unicode support; raw UTF-8 is
 *        interpreted via the active ANSI code page and mangles CJK.
 *
 *        When clip.exe fails (rare — appears in Nano Server, certain
 *        container setups), fall through to OSC 52 so users running
 *        in Windows Terminal / ConEmu / Cmder still get a working
 *        copy.
 *
 * Image: PowerShell `[System.Windows.Forms.Clipboard]::GetImage()`
 *        writes a PNG to a temp file. Slow due to PowerShell startup
 *        (~300 ms) but reliable on stock Windows 10+.
 *
 * Both methods follow the speculative-call contract: when the
 * capability is unavailable or the clipboard contains nothing
 * relevant, return null / false instead of throwing.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ClipboardImage, ClipboardProvider } from "../types.js";
import { osc52Clipboard } from "./osc52.js";

function writeTextViaClipExe(text: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const proc = spawn("clip.exe", {
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        resolve(false);
      }, 2000);
      proc.on("error", () => { clearTimeout(timer); resolve(false); });
      proc.on("close", (code) => { clearTimeout(timer); resolve(code === 0); });
      // clip.exe with a UTF-16LE BOM prefix preserves Unicode round-trip.
      // Without the BOM clip.exe falls back to the active ANSI code
      // page and mangles CJK / emoji.
      const bom = Buffer.from([0xff, 0xfe]);
      const body = Buffer.from(text, "utf16le");
      proc.stdin.end(Buffer.concat([bom, body]));
    } catch {
      resolve(false);
    }
  });
}

function buildReadImageScript(outPath: string): string {
  // PowerShell script: load WinForms, fetch clipboard image, save as
  // PNG. Backticks escape special chars in the path. Returns "png" on
  // success or empty string when there's no image.
  //
  // `$null -ne $img` (vs. `$img -ne $null`) matches PSScriptAnalyzer's
  // recommended order — safer when the LHS is a collection because
  // PowerShell's `-ne` distributes over arrays.
  const escapedPath = outPath.replace(/'/g, "''");
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    `if ($null -ne $img) { $img.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png); 'png' } else { '' }`,
  ].join("; ");
}

function readImageViaPowerShell(): ClipboardImage | null {
  const tempPath = join(tmpdir(), `fermi-clipboard-${process.pid}-${Date.now()}.png`);

  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", buildReadImageScript(tempPath)],
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    );

    if (result.status !== 0) return null;
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    if (stdout !== "png") return null;
    if (!existsSync(tempPath)) return null;

    const buffer = readFileSync(tempPath);
    if (buffer.length === 0) return null;

    return { buffer, mediaType: "image/png" };
  } catch {
    return null;
  } finally {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export const win32Clipboard: ClipboardProvider = {
  id: "win32-clip.exe+powershell",

  async writeText(text: string): Promise<boolean> {
    if (process.platform !== "win32") return false;
    const ok = await writeTextViaClipExe(text);
    if (ok) return true;
    // Tail fallback: OSC 52 via terminal. Works in Windows Terminal,
    // ConEmu, Cmder. Won't help in the legacy cmd.exe window.
    return osc52Clipboard.writeText(text);
  },

  async readImage(): Promise<ClipboardImage | null> {
    if (process.platform !== "win32") return null;
    return readImageViaPowerShell();
  },
};
