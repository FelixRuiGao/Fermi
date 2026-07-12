/**
 * Unified path-externality evaluation — the single source of truth for
 * "is this path inside the project?".
 *
 * Consumers (all four previously had their own, mutually inconsistent
 * answer): the advisor's file-tool external gate, bash cwd / cd-context
 * externality, the artifacts-dir bypass, and the executor's external
 * write allowlist matching.
 *
 * Externality is decided on the CANONICAL path (realpath of the target,
 * or of its nearest existing ancestor for to-be-created paths), with the
 * base directory canonicalized the same way. Lexical-only judgment let a
 * project-internal symlink reach outside without ever looking external
 * (the P0-1 bypass); canonicalizing only one side breaks the common
 * macOS case where the project root itself sits behind a symlink
 * (`/tmp` → `/private/tmp`).
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { toPosixPath } from "../security/path.js";
import { osCapabilities } from "../platform/index.js";

export interface PathAccessInfo {
  /** Lexical resolution of the raw path (relative paths against opts.cwd). */
  resolvedPath: string;
  /** realpath of the target, or realpath(nearest existing ancestor) + lexical remainder. */
  canonicalPath: string;
  /** True when the canonical path is outside the canonical base directory. */
  isExternal: boolean;
  /** Lexical and canonical judgments disagree — a symlink crosses the boundary. */
  crossesSymlink: boolean;
  /**
   * Set when isExternal: the directory prefix an approval rule should
   * cover — the canonical path itself (dir targets) or its parent (file
   * targets), forward-slash form with a trailing `/`.
   */
  externalPrefix?: string;
}

/** Fold case on case-insensitive filesystems, mirroring security/path.ts. */
function isWithin(baseAbs: string, candidateAbs: string): boolean {
  const [base, candidate] = osCapabilities.caseInsensitiveFilesystem
    ? [baseAbs.toLowerCase(), candidateAbs.toLowerCase()]
    : [baseAbs, candidateAbs];
  const rel = path.relative(base, candidate);
  if (rel === "") return true;
  if (path.isAbsolute(rel)) return false; // Windows cross-drive safety
  return !rel.startsWith("..");
}

function nearestExistingAncestor(targetAbs: string): string | null {
  let current = targetAbs;
  while (true) {
    if (existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * realpath for existing paths; for missing ones, realpath of the nearest
 * existing ancestor with the untraversed lexical remainder re-appended.
 * Falls back to the lexical path when canonicalization fails outright
 * (permission errors, dangling mounts) — lexical checks still apply.
 */
export function canonicalizePath(absPath: string): string {
  try {
    if (existsSync(absPath)) return realpathSync(absPath);
    const ancestor = nearestExistingAncestor(absPath);
    if (!ancestor) return absPath;
    const ancestorCanonical = realpathSync(ancestor);
    const remainder = path.relative(ancestor, absPath);
    return remainder ? path.join(ancestorCanonical, remainder) : ancestorCanonical;
  } catch {
    return absPath;
  }
}

/**
 * True when `candidateAbs` canonically resides inside `baseAbs`
 * (both sides canonicalized). Used by the artifacts bypass and the
 * executor allowlist so their judgment can never diverge from the
 * advisor's.
 */
export function isCanonicallyWithin(baseAbs: string, candidateAbs: string): boolean {
  return isWithin(canonicalizePath(path.resolve(baseAbs)), canonicalizePath(path.resolve(candidateAbs)));
}

export function evaluatePathAccess(
  rawPath: string,
  opts: { projectRoot: string; cwd?: string },
): PathAccessInfo {
  const baseResolved = path.resolve(opts.projectRoot);
  const cwd = opts.cwd ? path.resolve(opts.cwd) : baseResolved;
  const resolvedPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(cwd, rawPath);

  const baseCanonical = canonicalizePath(baseResolved);
  const canonicalPath = canonicalizePath(resolvedPath);

  const lexInside = isWithin(baseResolved, resolvedPath);
  const canonInside = isWithin(baseCanonical, canonicalPath);

  const info: PathAccessInfo = {
    resolvedPath,
    canonicalPath,
    isExternal: !canonInside,
    crossesSymlink: lexInside !== canonInside,
  };

  if (info.isExternal) {
    info.externalPrefix = externalDirPrefix(canonicalPath, rawPath.endsWith("/") || rawPath.endsWith("\\"));
  }
  return info;
}

/**
 * The directory prefix an external_path rule should cover for a target:
 * the target itself when it is (or is spelled as) a directory, its
 * parent otherwise. Forward-slash form, trailing `/`.
 */
export function externalDirPrefix(canonicalPath: string, spelledAsDir = false): string {
  let isDir = spelledAsDir;
  if (!isDir) {
    try { isDir = existsSync(canonicalPath) && statSync(canonicalPath).isDirectory(); } catch { /* ignore */ }
  }
  const dir = isDir ? canonicalPath : path.dirname(canonicalPath);
  const posix = toPosixPath(dir);
  return posix.endsWith("/") ? posix : posix + "/";
}
