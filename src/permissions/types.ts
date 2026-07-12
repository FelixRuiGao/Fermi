/**
 * Permission system types and constants.
 *
 * Three permission modes control the session-level policy:
 *   read_only  — only read tools auto-allowed
 *   reversible — read + reversible write auto-allowed
 *   yolo       — everything auto-allowed except catastrophic
 *
 * Five permission classes categorize each tool invocation:
 *   read, write_reversible, write_potent, write_danger, catastrophic
 *   (plus spawn, which is always allowed)
 */

// ------------------------------------------------------------------
// Permission mode — session-level policy
// ------------------------------------------------------------------

export type PermissionMode = "read_only" | "reversible" | "yolo";

export const PERMISSION_MODE_ORDER: Record<PermissionMode, number> = {
  read_only: 0,
  reversible: 1,
  yolo: 2,
};

export function effectiveMode(sessionMode: PermissionMode, agentCeiling?: PermissionMode): PermissionMode {
  if (!agentCeiling) return sessionMode;
  return PERMISSION_MODE_ORDER[sessionMode] <= PERMISSION_MODE_ORDER[agentCeiling]
    ? sessionMode
    : agentCeiling;
}

// ------------------------------------------------------------------
// Permission class — per-invocation risk level
// ------------------------------------------------------------------

export type PermissionClass =
  | "read"
  | "spawn"
  | "write_reversible"
  | "write_potent"
  | "write_danger"
  | "catastrophic";

/** Severity ordering for PermissionClass comparisons (rules maxClass, segment folding). */
export const PERMISSION_CLASS_ORDER: Record<PermissionClass, number> = {
  read: 0,
  spawn: 1,
  write_reversible: 2,
  write_potent: 3,
  write_danger: 4,
  catastrophic: 5,
};

export function isValidPermissionClass(v: unknown): v is PermissionClass {
  return typeof v === "string" && v in PERMISSION_CLASS_ORDER;
}

// ------------------------------------------------------------------
// Invocation assessment — output of tool classification
// ------------------------------------------------------------------

export interface InvocationAssessment {
  permissionClass: PermissionClass;
  toolName: string;
  /** For bash: the parsed command name(s). */
  commands?: string[];
  /** For bash: literal path arguments extracted for external-path gating. */
  pathTargets?: string[];
  /** For bash: canonical pattern for rule matching (e.g. "npm test"). */
  canonicalPattern?: string;
  /** Whether a tool_pattern rule is meaningful for this invocation. */
  canMemoize?: boolean;
  /**
   * For bash: effective cwd after cd resolution, set when a non-read
   * segment runs outside projectRoot. The sentinel value
   * `EXTERNAL_CWD_UNKNOWN` means the cwd could not be resolved
   * (`cd -`, `cd $VAR`, `cd ~user`).
   */
  externalCwd?: string;
  /** For file tools: resolved path prefix that is outside projectRoot. */
  externalPathPrefix?: string;
  /**
   * For bash: literal write targets (canonical) that resolve outside
   * projectRoot — cp/mv/mkdir/touch/ln/tee targets and file redirects.
   * The advisor routes these through the external_path gate.
   */
  externalWriteTargets?: string[];
  /**
   * Target is a permission-system control-plane file (permissions/
   * settings/hooks). Always asks in every mode; never satisfiable by
   * rules.
   */
  controlPlane?: boolean;
}

/** Sentinel for externalCwd when the effective cwd cannot be resolved. */
export const EXTERNAL_CWD_UNKNOWN = "(unresolved)";

// ------------------------------------------------------------------
// Decision — what the advisor tells the gate
// ------------------------------------------------------------------

export type AdvisorDecision =
  | { kind: "allow" }
  | { kind: "deny"; message: string }
  | { kind: "ask"; assessment: InvocationAssessment; offers: ApprovalOffer[] };

// ------------------------------------------------------------------
// Approval offers — what the user can choose when asked
// ------------------------------------------------------------------

export type ApprovalOfferType = "tool_once" | "tool_pattern" | "external_path" | "mode_upgrade";

export interface ApprovalOffer {
  type: ApprovalOfferType;
  label: string;
  scope?: "session" | "project" | "global";
  /** For tool_pattern: the rule to persist if chosen. */
  rule?: PermissionRule;
}

// ------------------------------------------------------------------
// Permission rules — persisted allow/deny rules
// ------------------------------------------------------------------

export interface ToolPatternRule {
  id: string;
  type: "tool_pattern";
  action: "allow" | "deny";
  /** Tool name (exact match). */
  tool: string;
  /** For bash: command pattern (e.g. "npm test", "git *"). */
  pattern?: string;
  /**
   * Ceiling recorded at creation time: the rule only matches
   * invocations whose class is <= maxClass. Rules from older files
   * without the field are capped at write_reversible — the safe
   * fallback re-asks once for potent/danger commands and the re-grant
   * writes the field. Deny rules ignore the ceiling (deny always
   * applies).
   */
  maxClass?: PermissionClass;
  scope: "session" | "workspace" | "project" | "global";
  createdAt: number;
}

export interface ExternalPathRule {
  id: string;
  type: "external_path";
  action: "allow";
  accessKind: "read" | "write_reversible";
  /** Directory prefix (canonical absolute path, forward-slash form). */
  pathPrefix: string;
  scope: "session" | "workspace" | "project";
  createdAt: number;
}

export type PermissionRule = ToolPatternRule | ExternalPathRule;

export interface PermissionRuleFile {
  version: 1;
  rules: PermissionRule[];
}
