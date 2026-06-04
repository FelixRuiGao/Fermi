import { existsSync } from "fs";
import { join, delimiter } from "path";
import { homedir } from "os";

export interface ResolvedBinary {
  path: string;
  source: "path" | "fermi-home" | "not-found";
}

const isWindows = process.platform === "win32";
// On Windows the Bun-compiled binary may be named fermi.exe OR fermi.
const BINARY_NAMES = isWindows ? ["fermi.exe", "fermi"] : ["fermi"];

/** Fermi's default install directory (matches install.sh / install.ps1). */
export function fermiInstallDir(): string {
  return join(homedir(), ".fermi", "bin");
}

export function resolveFermiBinary(): ResolvedBinary {
  // 1. Scan PATH (cross-platform — avoids spawning which/where).
  const pathDirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of BINARY_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return { path: candidate, source: "path" };
    }
  }

  // 2. Check the default install directory (~/.fermi/bin/).
  const installDir = fermiInstallDir();
  for (const name of BINARY_NAMES) {
    const candidate = join(installDir, name);
    if (existsSync(candidate)) return { path: candidate, source: "fermi-home" };
  }

  return { path: "", source: "not-found" };
}
