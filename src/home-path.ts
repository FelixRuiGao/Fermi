import { homedir } from "node:os";
import { join } from "node:path";

export const FERMI_HOME_DIR = ".fermi";

/**
 * Root for all Fermi state (settings, hooks, skills, logs, per-project data).
 * `FERMI_HOME` overrides the default `~/.fermi` — used for multi-profile setups
 * and to isolate tests from the real home dir. Every home-rooted path resolves
 * through here (directly or via resolveAssetPaths), so the override applies
 * uniformly across the settings / MCP / hooks control plane.
 */
export function getFermiHomeDir(): string {
  return process.env.FERMI_HOME ?? join(homedir(), FERMI_HOME_DIR);
}
