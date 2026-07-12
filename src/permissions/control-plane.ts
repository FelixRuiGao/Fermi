/**
 * Control-plane file identification.
 *
 * Control-plane files are the ones that decide what the permission
 * system itself allows or what code gets executed automatically:
 * permission rule files, settings (MCP server commands live there),
 * hook manifests, and workspace trust records. Writes to them always
 * ask — in every mode, yolo included — and can never be satisfied by
 * permission rules (a rule file must not be able to approve edits to
 * itself). See advisor.ts.
 *
 * Deliberately NOT control-plane: workspace skills/ (prompt content —
 * writing a skill is a legitimate workflow and doesn't execute
 * processes by itself), AGENTS.md, and everything else in .fermi/.
 *
 * Judgment is canonical (path-access) so a symlink alias of a
 * control-plane file is caught. Bash-side coverage comes from the
 * external write-target extraction feeding the same predicate — literal
 * targets only, documented best-effort.
 */

import path from "node:path";
import { getFermiHomeDir } from "../home-path.js";
import { canonicalizePath } from "./path-access.js";
import { osCapabilities } from "../platform/index.js";

const CONTROL_PLANE_BASENAMES = new Set(["permissions.json", "settings.json", "trust.json"]);

function fold(p: string): string {
  const posix = p.replace(/\\/g, "/");
  return osCapabilities.caseInsensitiveFilesystem ? posix.toLowerCase() : posix;
}

function isUnder(dir: string, candidate: string): boolean {
  const d = fold(dir).replace(/\/+$/, "") + "/";
  return fold(candidate).startsWith(d);
}

export function isControlPlanePath(
  rawPath: string,
  opts: { projectRoot: string; fermiHome?: string; cwd?: string },
): boolean {
  const base = opts.cwd ?? opts.projectRoot;
  const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(base, rawPath);
  const canonical = canonicalizePath(resolved);
  const basename = path.basename(canonical).toLowerCase();

  const roots: string[] = [];
  const workspaceFermi = canonicalizePath(path.join(path.resolve(opts.projectRoot), ".fermi"));
  roots.push(workspaceFermi);
  const home = canonicalizePath(path.resolve(opts.fermiHome ?? getFermiHomeDir()));
  roots.push(home);

  for (const root of roots) {
    // <root>/permissions.json, <root>/settings.json
    if (CONTROL_PLANE_BASENAMES.has(basename) && fold(path.dirname(canonical)) === fold(root)) {
      return true;
    }
    // <root>/hooks/** — hook manifests AND the scripts next to them.
    if (isUnder(path.join(root, "hooks"), canonical)) return true;
  }

  // ~/.fermi/projects/<slug>/{permissions,trust}.json — per-project
  // stores (rules and workspace-trust records).
  const projectsDir = path.join(home, "projects");
  if (CONTROL_PLANE_BASENAMES.has(basename) && isUnder(projectsDir, canonical)) {
    return true;
  }

  return false;
}
