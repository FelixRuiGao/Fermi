/**
 * Permission rules — storage and matching.
 *
 * Four layers (most specific wins):
 *   session   — in-memory only, dies with the session
 *   workspace — {projectRoot}/.fermi/permissions.json (user-authored;
 *               deny rules always apply, allow rules only when the
 *               workspace is trusted — see security/workspace-trust.ts)
 *   project   — ~/.fermi/projects/<slug>/permissions.json (system-managed)
 *   global    — ~/.fermi/permissions.json
 *
 * Semantics:
 *   - deny beats allow, in every mode, before every other gate branch.
 *   - allow rules carry a maxClass ceiling recorded at creation time;
 *     they never match an invocation classified above it. Legacy rules
 *     without the field are capped at write_reversible (re-asks once).
 *   - scope is derived from the file a rule was loaded from; a scope
 *     field inside the file is ignored.
 *   - files are strictly validated per rule; invalid entries are
 *     isolated (not the whole file) and surfaced via getLoadErrors().
 *
 * System writes (from approval choices) go to project or global.
 * Workspace rules are read-only — only the user creates/edits them.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { getFermiHomeDir } from "../home-path.js";
import { toPosixPath } from "../security/path.js";
import { osCapabilities } from "../platform/index.js";
import type {
  PermissionRule,
  PermissionRuleFile,
  InvocationAssessment,
  ExternalPathRule,
  ToolPatternRule,
  PermissionClass,
} from "./types.js";
import { PERMISSION_CLASS_ORDER, isValidPermissionClass } from "./types.js";

export type RuleScope = "session" | "workspace" | "project" | "global";

export interface RuleLoadError {
  sourcePath: string;
  index: number;
  reason: string;
}

export interface RuleMatch {
  deny: PermissionRule | null;
  allow: PermissionRule | null;
}

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  rules: PermissionRule[];
  errors: RuleLoadError[];
}

const SCOPE_ID_PREFIX: Record<RuleScope, string> = {
  session: "s_",
  workspace: "w_",
  project: "p_",
  global: "g_",
};

// ------------------------------------------------------------------
// PermissionRuleStore — manages rules across all layers
// ------------------------------------------------------------------

export class PermissionRuleStore {
  private _sessionRules: PermissionRule[] = [];
  /** ~/.fermi/projects/<slug>/ — system-managed project store. Absent →
   * project-scoped persistence is unavailable (offers omit that scope). */
  private _projectStoreDir: string | undefined;
  /** {projectRoot} — workspace root (read-only for rules). */
  private _workspaceRoot: string | undefined;
  /** Whether workspace allow rules apply (trust gate). Defaults to false. */
  private _isWorkspaceTrusted: () => boolean;
  /** Parse cache keyed by file path; invalidated by mtime/size change so
   * manual edits still take effect immediately (stat every evaluation,
   * parse only on change). */
  private _fileCache = new Map<string, FileCacheEntry>();

  constructor(opts: {
    projectStoreDir?: string;
    workspaceRoot?: string;
    isWorkspaceTrusted?: () => boolean;
  }) {
    this._projectStoreDir = opts.projectStoreDir;
    this._workspaceRoot = opts.workspaceRoot;
    this._isWorkspaceTrusted = opts.isWorkspaceTrusted ?? (() => false);
  }

  /** Project-scoped persistence available? (Sessions without a store: no.) */
  get hasProjectScope(): boolean {
    return this._projectStoreDir !== undefined;
  }

  // -- Query ----------------------------------------------------------

  /**
   * Match an assessment against all layers. Deny and allow are matched
   * independently: deny is unconditional; allow respects the maxClass
   * ceiling and the workspace trust gate. The advisor consumes deny
   * before everything else and allow only below the mode ceiling.
   */
  findMatching(assessment: InvocationAssessment): RuleMatch {
    const allRules = this._getEffectiveRules();
    const trusted = this._isWorkspaceTrusted();

    let deny: PermissionRule | null = null;
    let allow: PermissionRule | null = null;

    for (const rule of allRules) {
      if (rule.type !== "tool_pattern") continue;
      if (!this._ruleMatches(rule, assessment)) continue;
      if (rule.action === "deny") {
        if (!deny) deny = rule;
      } else {
        if (allow) continue;
        if (rule.scope === "workspace" && !trusted) continue;
        const ceiling = rule.maxClass ?? "write_reversible";
        if (PERMISSION_CLASS_ORDER[assessment.permissionClass] > PERMISSION_CLASS_ORDER[ceiling]) continue;
        allow = rule;
      }
      if (deny && allow) break;
    }

    return { deny, allow };
  }

  /** Get all effective rules, ordered: session > workspace > project > global. */
  private _getEffectiveRules(): PermissionRule[] {
    return [
      ...this._sessionRules,
      ...(this._workspaceRoot ? this._loadFileRules(this._workspaceFilePath()!, "workspace") : []),
      ...(this._projectStoreDir ? this._loadFileRules(this._projectFilePath()!, "project") : []),
      ...this._loadFileRules(this._globalFilePath(), "global"),
    ];
  }

  /** Get all rules for display (e.g. /permissions list). */
  getAllRules(): PermissionRule[] {
    return this._getEffectiveRules();
  }

  /** Parse/validation errors from the last load of each layer file. */
  getLoadErrors(): RuleLoadError[] {
    // Force a fresh load pass so errors reflect current file state.
    this._getEffectiveRules();
    const errors: RuleLoadError[] = [];
    for (const entry of this._fileCache.values()) {
      errors.push(...entry.errors);
    }
    return errors;
  }

  // -- Mutations -------------------------------------------------------

  addRule(rule: Omit<PermissionRule, "id" | "createdAt">): PermissionRule {
    if (rule.scope === "workspace") {
      throw new Error("Workspace rules are user-authored; the system never writes them.");
    }
    if (rule.scope === "project" && !this._projectStoreDir) {
      throw new Error("Project-scoped rules are unavailable: no project store is attached.");
    }
    // Store external_path prefixes in forward-slash form regardless of
    // the caller's input (defensive normalization for future callers).
    let normalizedRule: Omit<PermissionRule, "id" | "createdAt"> = rule;
    if (rule.type === "external_path") {
      const external = rule as Omit<ExternalPathRule, "id" | "createdAt">;
      normalizedRule = {
        ...external,
        pathPrefix: toPosixPath(external.pathPrefix),
      } as Omit<PermissionRule, "id" | "createdAt">;
    }
    const full = {
      ...normalizedRule,
      id: this._generateId(normalizedRule.scope as RuleScope),
      createdAt: Date.now(),
    } as PermissionRule;

    if (full.scope === "session") {
      const dup = this._sessionRules.find((r) => rulesEquivalent(r, full));
      if (dup) return dup;
      this._sessionRules.push(full);
      return full;
    }

    const filePath = full.scope === "project"
      ? this._projectFilePath()!
      : this._globalFilePath();
    // Merge-write: re-read the file at write time so a concurrent
    // session's additions survive (last-writer-wins only per rule id,
    // not per file).
    const existing = this._loadFileRules(filePath, full.scope as RuleScope);
    const dup = existing.find((r) => rulesEquivalent(r, full));
    if (dup) return dup;
    existing.push(full);
    this._saveFileRules(filePath, existing);
    return full;
  }

  revokeRule(ruleId: string): boolean {
    // Session rules
    const sessionIdx = this._sessionRules.findIndex((r) => r.id === ruleId);
    if (sessionIdx >= 0) {
      this._sessionRules.splice(sessionIdx, 1);
      return true;
    }

    // Workspace rules are user-authored files — never revoked by the
    // system. Explicit branch (not silent fallthrough) so callers can
    // message it.
    if (ruleId.startsWith("w_")) return false;

    // File-backed rules — determine scope from ID prefix
    const filePath = ruleId.startsWith("p_")
      ? this._projectFilePath()
      : ruleId.startsWith("g_")
        ? this._globalFilePath()
        : null;

    if (!filePath) return false;

    const scope: RuleScope = ruleId.startsWith("p_") ? "project" : "global";
    const rules = this._loadFileRules(filePath, scope);
    const idx = rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) return false;
    rules.splice(idx, 1);
    this._saveFileRules(filePath, rules);
    return true;
  }

  clearSessionRules(): void {
    this._sessionRules = [];
  }

  // -- External path rules ---------------------------------------------

  findMatchingExternalPathRule(
    resolvedPath: string,
    accessKind: "read" | "write_reversible",
  ): ExternalPathRule | null {
    // Both rule.pathPrefix and resolvedPath are compared in forward-slash
    // form; case is folded on case-insensitive filesystems (an approved
    // `D:\Data` must match `d:\data\file`). Fail-safe either way — never
    // widens a match on case-sensitive Linux.
    const ci = osCapabilities.caseInsensitiveFilesystem;
    const subject = toPosixPath(resolvedPath);
    const subjectCmp = ci ? subject.toLowerCase() : subject;
    const trusted = this._isWorkspaceTrusted();
    const allRules = this._getEffectiveRules();
    for (const rule of allRules) {
      if (rule.type !== "external_path") continue;
      if (rule.action !== "allow") continue;
      if (rule.scope === "workspace" && !trusted) continue;
      // A write needs a write-capable rule; a read is satisfied by either.
      if (accessKind === "write_reversible" && rule.accessKind !== "write_reversible") continue;
      const normalized = toPosixPath(rule.pathPrefix);
      // Ensure prefix ends with / to prevent /tmp/foo matching /tmp/foobar
      const prefix = normalized.endsWith("/") ? normalized : normalized + "/";
      const prefixCmp = ci ? prefix.toLowerCase() : prefix;
      if (subjectCmp.startsWith(prefixCmp) || subjectCmp === prefixCmp.slice(0, -1)) return rule;
    }
    return null;
  }

  /**
   * Approved external path prefixes for the executor's defense-in-depth
   * allowlist, filtered by access kind: the write allowlist only carries
   * write-capable rules — a read-only approval must not widen the
   * executor's write scope.
   */
  getApprovedExternalPrefixes(accessKind: "read" | "write_reversible"): string[] {
    const trusted = this._isWorkspaceTrusted();
    const allRules = this._getEffectiveRules();
    const prefixes: string[] = [];
    for (const rule of allRules) {
      if (rule.type !== "external_path") continue;
      if (rule.action !== "allow") continue;
      if (rule.scope === "workspace" && !trusted) continue;
      if (accessKind === "write_reversible" && rule.accessKind !== "write_reversible") continue;
      const normalized = toPosixPath(rule.pathPrefix);
      prefixes.push(normalized.endsWith("/") ? normalized : normalized + "/");
    }
    return prefixes;
  }

  // -- Rule matching ---------------------------------------------------

  private _ruleMatches(rule: ToolPatternRule, assessment: InvocationAssessment): boolean {
    if (rule.tool !== assessment.toolName) return false;

    // If rule has a pattern, match against the canonical pattern
    if (rule.pattern) {
      if (assessment.canonicalPattern) {
        return this._patternMatches(rule.pattern, assessment.canonicalPattern);
      }
      // No canonical pattern (complex command) — pattern rules don't apply
      return false;
    }

    // No pattern specified — matches all invocations of this tool
    return true;
  }

  private _patternMatches(rulePattern: string, subject: string): boolean {
    // Exact match
    if (rulePattern === subject) return true;

    // Simple glob: "git *" matches "git status", "git commit", etc.
    if (rulePattern.endsWith(" *")) {
      const prefix = rulePattern.slice(0, -1); // "git "
      return subject.startsWith(prefix);
    }

    return false;
  }

  // -- File I/O --------------------------------------------------------

  /** System-managed project rules: ~/.fermi/projects/<slug>/permissions.json */
  private _projectFilePath(): string | null {
    if (!this._projectStoreDir) return null;
    return join(this._projectStoreDir, "permissions.json");
  }

  /** User-authored workspace rules: {projectRoot}/.fermi/permissions.json (read-only) */
  private _workspaceFilePath(): string | null {
    if (!this._workspaceRoot) return null;
    return join(this._workspaceRoot, ".fermi", "permissions.json");
  }

  private _globalFilePath(): string {
    return join(getFermiHomeDir(), "permissions.json");
  }

  private _loadFileRules(filePath: string, scope: RuleScope): PermissionRule[] {
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      this._fileCache.delete(filePath);
      return [];
    }

    const cached = this._fileCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.rules;
    }

    const rules: PermissionRule[] = [];
    const errors: RuleLoadError[] = [];
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf-8")) as PermissionRuleFile;
      if (raw.version !== 1 || !Array.isArray(raw.rules)) {
        errors.push({ sourcePath: filePath, index: -1, reason: "Expected { version: 1, rules: [...] }" });
      } else {
        raw.rules.forEach((entry, index) => {
          const validated = validateRule(entry, index, scope);
          if (typeof validated === "string") {
            errors.push({ sourcePath: filePath, index, reason: validated });
          } else {
            rules.push(validated);
          }
        });
      }
    } catch (err) {
      errors.push({
        sourcePath: filePath,
        index: -1,
        reason: `Unreadable or invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    this._fileCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, rules, errors });
    return rules;
  }

  private _saveFileRules(filePath: string, rules: PermissionRule[]): void {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    const data: PermissionRuleFile = { version: 1, rules };
    const tmpPath = filePath + ".tmp." + process.pid;
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    renameSync(tmpPath, filePath);
    this._fileCache.delete(filePath);
  }

  private _generateId(scope: RuleScope): string {
    return SCOPE_ID_PREFIX[scope] + randomUUID().slice(0, 8);
  }
}

// ------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------

/** Two rules that would grant/deny the same thing. */
function rulesEquivalent(a: PermissionRule, b: PermissionRule): boolean {
  if (a.type !== b.type || a.action !== b.action || a.scope !== b.scope) return false;
  if (a.type === "tool_pattern" && b.type === "tool_pattern") {
    return a.tool === b.tool && (a.pattern ?? "") === (b.pattern ?? "") &&
      (a.maxClass ?? "write_reversible") === (b.maxClass ?? "write_reversible");
  }
  if (a.type === "external_path" && b.type === "external_path") {
    return a.accessKind === b.accessKind && a.pathPrefix === b.pathPrefix;
  }
  return false;
}

/**
 * Validate one raw rule entry. Returns the normalized rule or an error
 * string. The scope always comes from the source layer — a scope field
 * in the file is ignored (a workspace file must not fabricate "global").
 */
function validateRule(entry: unknown, index: number, scope: RuleScope): PermissionRule | string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return "Rule must be an object";
  }
  const r = entry as Record<string, unknown>;
  const id = typeof r["id"] === "string" && r["id"].trim()
    ? SCOPE_ID_PREFIX[scope] + String(r["id"]).replace(/^[swpg]_/, "")
    : `${SCOPE_ID_PREFIX[scope]}file${index}`;
  const createdAt = typeof r["createdAt"] === "number" ? r["createdAt"] : 0;

  if (r["type"] === "tool_pattern") {
    if (r["action"] !== "allow" && r["action"] !== "deny") {
      return `tool_pattern rule needs action "allow" or "deny" (got ${JSON.stringify(r["action"])})`;
    }
    if (typeof r["tool"] !== "string" || !r["tool"].trim()) {
      return "tool_pattern rule needs a non-empty string `tool`";
    }
    if (r["pattern"] !== undefined && typeof r["pattern"] !== "string") {
      return "`pattern` must be a string when present";
    }
    if (r["maxClass"] !== undefined && !isValidPermissionClass(r["maxClass"])) {
      return `\`maxClass\` must be a permission class (got ${JSON.stringify(r["maxClass"])})`;
    }
    const rule: ToolPatternRule = {
      id,
      type: "tool_pattern",
      action: r["action"],
      tool: r["tool"],
      scope,
      createdAt,
    };
    if (typeof r["pattern"] === "string" && r["pattern"].trim()) rule.pattern = r["pattern"];
    if (isValidPermissionClass(r["maxClass"])) rule.maxClass = r["maxClass"] as PermissionClass;
    return rule;
  }

  if (r["type"] === "external_path") {
    if (r["action"] !== "allow") {
      return `external_path rule only supports action "allow" (got ${JSON.stringify(r["action"])})`;
    }
    if (r["accessKind"] !== "read" && r["accessKind"] !== "write_reversible") {
      return `external_path rule needs accessKind "read" or "write_reversible"`;
    }
    if (typeof r["pathPrefix"] !== "string" || !r["pathPrefix"].trim()) {
      return "external_path rule needs a non-empty string `pathPrefix`";
    }
    if (scope === "global") {
      return "external_path rules are not supported at global scope";
    }
    const rule: ExternalPathRule = {
      id,
      type: "external_path",
      action: "allow",
      accessKind: r["accessKind"],
      pathPrefix: toPosixPath(r["pathPrefix"]),
      scope,
      createdAt,
    };
    return rule;
  }

  return `Unknown rule type ${JSON.stringify(r["type"])}`;
}
