import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

export interface ResolvedBinary {
  path: string;
  source: "path" | "fermi-home" | "not-found";
}

export function resolveFermiBinary(): ResolvedBinary {
  // 1. Check PATH
  try {
    const which = execSync("which fermi", { encoding: "utf8", timeout: 3000 }).trim();
    if (which && existsSync(which)) {
      return { path: which, source: "path" };
    }
  } catch {}

  // 2. Check ~/.fermi/bin/fermi
  const home = homedir();
  const fermiBin = join(home, ".fermi", "bin", "fermi");
  if (existsSync(fermiBin)) {
    return { path: fermiBin, source: "fermi-home" };
  }

  return { path: "", source: "not-found" };
}
