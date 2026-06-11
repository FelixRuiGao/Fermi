/**
 * One-click Fermi installer. Downloads the platform tarball from GitHub
 * Releases and extracts it into ~/.fermi/bin/ — mirroring install.sh /
 * install.ps1 but driven from the extension with a progress UI.
 */

import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream, mkdirSync, chmodSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { fermiInstallDir } from "./binary-resolver.js";

const execFileAsync = promisify(execFile);

const REPO = "FelixRuiGao/Fermi";

function assetName(): string | null {
  const { platform, arch } = process;
  if (platform === "darwin" && arch === "arm64") return "fermi-darwin-arm64.tar.gz";
  if (platform === "linux" && (arch === "x64" || arch === "arm64")) return `fermi-linux-${arch}.tar.gz`;
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) return `fermi-win32-${arch}.tar.gz`;
  return null;
}

/**
 * Download + extract fermi. Returns true on success.
 */
export async function installFermi(): Promise<boolean> {
  const asset = assetName();
  if (!asset) {
    vscode.window.showErrorMessage(
      `Fermi: no prebuilt binary for ${process.platform}-${process.arch}. Build from source instead.`,
    );
    return false;
  }

  const url = `https://github.com/${REPO}/releases/latest/download/${asset}`;
  const installDir = fermiInstallDir();
  const tmp = join(tmpdir(), `fermi-install-${Date.now()}`);
  const tarballPath = join(tmp, asset);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing Fermi",
      cancellable: false,
    },
    async (progress) => {
      try {
        mkdirSync(tmp, { recursive: true });
        mkdirSync(installDir, { recursive: true });

        progress.report({ message: "Downloading..." });
        const resp = await fetch(url, { redirect: "follow" });
        if (!resp.ok || !resp.body) {
          throw new Error(`Download failed: HTTP ${resp.status}`);
        }
        await pipeline(Readable.fromWeb(resp.body as any), createWriteStream(tarballPath));

        progress.report({ message: "Extracting..." });
        // `tar` ships with macOS, Linux, and Windows 10+ (bsdtar).
        await execFileAsync("tar", ["-xzf", tarballPath, "-C", installDir], { timeout: 60000 });

        // Make executable on Unix.
        if (process.platform !== "win32") {
          for (const name of ["fermi"]) {
            const p = join(installDir, name);
            if (existsSync(p)) {
              try { chmodSync(p, 0o755); } catch {}
            }
          }
          // Clear macOS quarantine so Gatekeeper doesn't block it.
          if (process.platform === "darwin") {
            const p = join(installDir, "fermi");
            try { await execFileAsync("xattr", ["-dr", "com.apple.quarantine", p], { timeout: 10000 }); } catch {}
          }
        }

        progress.report({ message: "Done" });
        vscode.window.showInformationMessage("Fermi installed successfully.");
        return true;
      } catch (err: any) {
        vscode.window.showErrorMessage(`Fermi install failed: ${err?.message ?? err}`);
        return false;
      }
    },
  );
}
