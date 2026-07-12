/**
 * PermissionAdvisor — the main GateAdvisor that makes allow/ask/deny decisions.
 *
 * Fixed evaluation pipeline (every step reads live state — mode
 * switches and rule-file edits take effect mid-turn, per call):
 *
 *   0. classify → InvocationAssessment (+ MCP sensitive escalation,
 *      control-plane detection)
 *   1. deny rules — unconditional, before every other branch (a deny
 *      must hold in read_only and in external-path scenarios alike)
 *   2. artifacts-dir bypass (file tools inside the session's scratch
 *      space, canonical judgment)
 *   3. execution-grant redemption (one-shot, digest-bound, class
 *      re-checked)
 *   4. control-plane writes → ask (every mode; rules can't satisfy)
 *   5. external-path gate (file tools + bash literal write targets;
 *      yolo bypasses)
 *   6. external-cwd gate (bash whose non-read segments run outside the
 *      project; yolo bypasses)
 *   7. allow rules (mode ≠ read_only; ceiling-checked in the store)
 *   8. decision matrix (mode × class)
 *   9. approval offers (explicit policy table)
 */

import path from "node:path";
import type { GateAdvisor, GateDecision } from "../tool-runtime.js";
import type { ToolPreflightContext } from "../agents/tool-loop.js";
import { classifyToolAsync } from "./classify.js";
import { PermissionRuleStore } from "./rules.js";
import type { ShellKind, OsCapabilities } from "../platform/types.js";
import { osCapabilities } from "../platform/index.js";
import type {
  PermissionMode,
  InvocationAssessment,
  ApprovalOffer,
  PermissionRule,
  PermissionClass,
  ExternalPathRule,
} from "./types.js";
import { effectiveMode, PERMISSION_CLASS_ORDER, EXTERNAL_CWD_UNKNOWN } from "./types.js";
import { evaluatePathAccess, externalDirPrefix, isCanonicallyWithin } from "./path-access.js";
import { isControlPlanePath } from "./control-plane.js";
import { ExecutionGrantStore, computeArgsDigest } from "./grants.js";
import { applyDecisionMatrix, buildApprovalOffers } from "./policy.js";

// File tools whose `path` argument participates in the external-path
// gate and the artifacts bypass.
const FILE_TOOLS_WITH_PATH = new Set([
  "read_file", "write_file", "edit_file", "list_dir", "glob", "grep",
]);

const FILE_WRITE_TOOLS = new Set(["write_file", "edit_file"]);

// ------------------------------------------------------------------
// PermissionAdvisor
// ------------------------------------------------------------------

export class PermissionAdvisor implements GateAdvisor {
  private _ruleStore: PermissionRuleStore;
  private _sessionMode: PermissionMode;
  private _agentCeiling?: PermissionMode;
  private _projectRoot: string;
  private _shellKind: ShellKind;
  private _caps: OsCapabilities;
  private _getSessionArtifactsDir?: () => string | null;
  private _getMcpToolRisk?: (toolName: string) => "normal" | "sensitive";

  /** One-shot execution grants (digest-bound "Allow once"). */
  private _grants = new ExecutionGrantStore();

  constructor(opts: {
    ruleStore: PermissionRuleStore;
    sessionMode?: PermissionMode;
    agentCeiling?: PermissionMode;
    projectRoot?: string;
    shellKind?: ShellKind;
    caps?: OsCapabilities;
    /** Session artifacts dir — file tools inside it bypass the gate. */
    getSessionArtifactsDir?: () => string | null;
    /** MCP tool risk lookup (config-declared sensitive_tools). */
    getMcpToolRisk?: (toolName: string) => "normal" | "sensitive";
  }) {
    this._ruleStore = opts.ruleStore;
    this._sessionMode = opts.sessionMode ?? "reversible";
    this._agentCeiling = opts.agentCeiling;
    this._projectRoot = opts.projectRoot ?? process.cwd();
    this._shellKind = opts.shellKind ?? "bash";
    this._caps = opts.caps ?? osCapabilities;
    this._getSessionArtifactsDir = opts.getSessionArtifactsDir;
    this._getMcpToolRisk = opts.getMcpToolRisk;
  }

  get sessionMode(): PermissionMode {
    return this._sessionMode;
  }

  set sessionMode(mode: PermissionMode) {
    this._sessionMode = mode;
  }

  get agentCeiling(): PermissionMode | undefined {
    return this._agentCeiling;
  }

  get ruleStore(): PermissionRuleStore {
    return this._ruleStore;
  }

  get projectRoot(): string {
    return this._projectRoot;
  }

  // -- GateAdvisor interface -------------------------------------------

  async evaluate(ctx: ToolPreflightContext): Promise<GateDecision> {
    // 0. Classify — live per call.
    const assessment = await classifyToolAsync(
      ctx.toolName, ctx.toolArgs, this._projectRoot, this._shellKind, this._caps,
    );
    const mode = effectiveMode(this._sessionMode, this._agentCeiling);

    // 0a. MCP sensitive-tool escalation (config-declared).
    if (ctx.toolName.startsWith("mcp__") &&
        this._getMcpToolRisk?.(ctx.toolName) === "sensitive") {
      assessment.permissionClass = maxClass(assessment.permissionClass, "write_danger");
      assessment.canMemoize = false; // no persistent allow for sensitive tools
    }

    // 0b. Control-plane detection: file-tool writes and bash literal
    //     write targets aimed at permission/settings/hooks files.
    this._detectControlPlane(ctx, assessment);

    // 1. Deny rules — before everything, in every mode. A deny is the
    //    hardest veto the user can express; grants and external-path
    //    approvals must not outrank it.
    const ruleMatch = this._ruleStore.findMatching(assessment);
    if (ruleMatch.deny) {
      return { kind: "deny", message: `Denied by rule: ${ruleMatch.deny.id}` };
    }

    // 2. Artifacts-dir bypass: file tools operating inside the agent's
    //    own scratch space need no approval. Canonical judgment — an
    //    artifacts-internal symlink pointing elsewhere does NOT bypass.
    if (this._isArtifactsBypass(ctx)) {
      return { kind: "allow" };
    }

    // 3. Execution-grant redemption. One-shot (delete-on-read), bound
    //    to the argument digest, and re-checked against the current
    //    classification: if the class escalated since approval
    //    (filesystem state changed), the grant does not apply.
    const grant = this._grants.consume({
      toolCallId: ctx.toolCallId,
      argsDigest: computeArgsDigest(ctx.toolName, ctx.toolArgs),
    });
    if (grant && PERMISSION_CLASS_ORDER[assessment.permissionClass] <= PERMISSION_CLASS_ORDER[grant.approvedClass]) {
      return { kind: "allow" };
    }

    // 4. Control-plane writes ask in EVERY mode (yolo included) and are
    //    never satisfiable by rules: a permission file must not be able
    //    to approve edits to itself.
    if (assessment.controlPlane) {
      return this._ask(ctx, assessment, mode);
    }

    // 5. External-path gate (yolo bypasses).
    if (mode !== "yolo") {
      if (FILE_TOOLS_WITH_PATH.has(ctx.toolName)) {
        const decision = this._checkExternalPath(ctx, assessment);
        if (decision) return decision;
      }
      const bashExternal = this._checkExternalWriteTargets(ctx, assessment);
      if (bashExternal) return bashExternal;
    }

    // 6. External-cwd gate for bash (yolo bypasses). Set only when a
    //    non-read segment runs in an external context; rules don't
    //    apply there (offers are Allow once only).
    if (assessment.externalCwd && mode !== "yolo") {
      return this._ask(ctx, assessment, mode);
    }

    // 7. Allow rules — mode is a hard ceiling: read_only ignores allow
    //    rules entirely. The store already enforced the rule's maxClass
    //    ceiling and the workspace trust gate; catastrophic never
    //    matches a rule.
    if (mode !== "read_only" && ruleMatch.allow &&
        assessment.permissionClass !== "catastrophic") {
      return { kind: "allow" };
    }

    // 8. Decision matrix.
    if (applyDecisionMatrix(mode, assessment.permissionClass) === "allow") {
      return { kind: "allow" };
    }

    // 9. Ask with policy-table offers.
    return this._ask(ctx, assessment, mode);
  }

  // -- Grants ----------------------------------------------------------

  /**
   * Record a one-shot execution grant for an approved pending call.
   * The digest binds the grant to the exact arguments the user saw.
   */
  grantExecution(input: {
    toolCallId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    approvedClass: PermissionClass;
  }): void {
    this._grants.grant({
      toolCallId: input.toolCallId,
      argsDigest: computeArgsDigest(input.toolName, input.toolArgs),
      approvedClass: input.approvedClass,
    });
  }

  clearGrants(): void {
    this._grants.clear();
  }

  /** Persist a rule from an accepted approval offer. */
  acceptOffer(offer: ApprovalOffer): void {
    if (offer.rule) {
      this._ruleStore.addRule(offer.rule);
    }
  }

  // -- Pipeline pieces --------------------------------------------------

  private _detectControlPlane(ctx: ToolPreflightContext, assessment: InvocationAssessment): void {
    const candidates: string[] = [];
    if (FILE_WRITE_TOOLS.has(ctx.toolName)) {
      const raw = (ctx.toolArgs as Record<string, unknown>)["path"];
      if (typeof raw === "string" && raw) candidates.push(raw);
    }
    // Bash literal write targets (pathTargets carries internal ones too).
    if ((ctx.toolName === "bash" || ctx.toolName === "bash_background") && assessment.pathTargets) {
      candidates.push(...assessment.pathTargets);
    }
    for (const candidate of candidates) {
      if (isControlPlanePath(candidate, { projectRoot: this._projectRoot })) {
        assessment.controlPlane = true;
        assessment.permissionClass = maxClass(assessment.permissionClass, "write_danger");
        assessment.canMemoize = false;
        return;
      }
    }
  }

  private _isArtifactsBypass(ctx: ToolPreflightContext): boolean {
    if (!FILE_TOOLS_WITH_PATH.has(ctx.toolName)) return false;
    const raw = (ctx.toolArgs as Record<string, unknown>)["path"];
    if (typeof raw !== "string" || !raw) return false;
    const artifactsDir = this._getSessionArtifactsDir?.();
    if (!artifactsDir) return false;
    const abs = path.isAbsolute(raw) ? raw : path.resolve(this._projectRoot, raw);
    // Exact dir itself doesn't count (writing the dir entry), only strictly inside.
    if (path.resolve(abs) === path.resolve(artifactsDir)) return false;
    return isCanonicallyWithin(artifactsDir, abs);
  }

  // -- External path checking -----------------------------------------

  private _checkExternalPath(
    ctx: ToolPreflightContext,
    assessment: InvocationAssessment,
  ): GateDecision | null {
    const args = ctx.toolArgs as Record<string, unknown>;
    const rawPath = typeof args["path"] === "string" ? args["path"] : null;
    if (!rawPath) return null;

    const access = evaluatePathAccess(rawPath, { projectRoot: this._projectRoot });
    if (!access.isExternal) return null;

    // Determine access kind from tool
    const isWrite = FILE_WRITE_TOOLS.has(ctx.toolName);
    const accessKind = isWrite ? "write_reversible" as const : "read" as const;

    // Check existing external path rules (canonical subject)
    const matchingRule = this._ruleStore.findMatchingExternalPathRule(access.canonicalPath, accessKind);
    if (matchingRule) return null; // allowed by rule, continue normal flow

    const dirPrefix = access.externalPrefix ?? externalDirPrefix(access.canonicalPath);
    assessment.externalPathPrefix = dirPrefix;

    const offers = this._buildExternalPathOffers(accessKind, dirPrefix);
    const question = access.crossesSymlink
      ? `${ctx.toolName} accesses external path (via symlink): ${access.canonicalPath}`
      : `${ctx.toolName} accesses external path: ${access.canonicalPath}`;

    return {
      kind: "ask",
      question,
      toolCallId: ctx.toolCallId,
      offers,
      assessment,
    };
  }

  /**
   * Bash literal write targets outside the project run through the same
   * external_path rules as the file tools ("reads free, writes gated").
   */
  private _checkExternalWriteTargets(
    ctx: ToolPreflightContext,
    assessment: InvocationAssessment,
  ): GateDecision | null {
    for (const target of assessment.externalWriteTargets ?? []) {
      const matching = this._ruleStore.findMatchingExternalPathRule(target, "write_reversible");
      if (matching) continue;
      const dirPrefix = externalDirPrefix(target);
      assessment.externalPathPrefix = dirPrefix;
      const offers = this._buildExternalPathOffers("write_reversible", dirPrefix);
      const command = typeof (ctx.toolArgs as Record<string, unknown>)["command"] === "string"
        ? (ctx.toolArgs as Record<string, unknown>)["command"] as string
        : "";
      return {
        kind: "ask",
        question: `bash writes to external path ${target}: ${command}`,
        toolCallId: ctx.toolCallId,
        offers,
        assessment,
      };
    }
    return null;
  }

  // External path offers — no "Allow once" (the executor's write
  // allowlist consumes persistent rules; for reads, session scope is
  // narrow enough). No mode_upgrade (the external path rule is the
  // correct mechanism, not mode switching).
  private _buildExternalPathOffers(
    accessKind: "read" | "write_reversible",
    dirPrefix: string,
  ): ApprovalOffer[] {
    const offers: ApprovalOffer[] = [];
    const kindLabel = accessKind === "write_reversible" ? "read/write" : "read";
    const shortDir = dirPrefix.length > 50 ? "..." + dirPrefix.slice(-47) : dirPrefix;
    const scopes: Array<"session" | "project"> = this._ruleStore.hasProjectScope
      ? ["session", "project"]
      : ["session"];

    for (const scope of scopes) {
      const scopeLabel = scope === "session" ? "in this session" : "in this project";
      const rule: Omit<ExternalPathRule, "id" | "createdAt"> = {
        type: "external_path",
        action: "allow",
        accessKind,
        pathPrefix: dirPrefix,
        scope,
      };
      offers.push({
        type: "external_path",
        label: `Allow ${kindLabel} from ${shortDir} ${scopeLabel}`,
        scope,
        rule: rule as PermissionRule,
      });
    }
    return offers;
  }

  // -- Ask construction --------------------------------------------------

  private _ask(
    ctx: ToolPreflightContext,
    assessment: InvocationAssessment,
    mode: PermissionMode,
  ): GateDecision {
    const offers = buildApprovalOffers({
      mode,
      assessment,
      hasProjectScope: this._ruleStore.hasProjectScope,
    });
    return {
      kind: "ask",
      question: this._buildQuestion(ctx, assessment),
      toolCallId: ctx.toolCallId,
      offers,
      assessment,
    };
  }

  private _buildQuestion(
    ctx: ToolPreflightContext,
    assessment: InvocationAssessment,
  ): string {
    const cls = assessment.permissionClass;

    if (assessment.controlPlane) {
      const target = FILE_WRITE_TOOLS.has(ctx.toolName)
        ? String((ctx.toolArgs as Record<string, unknown>)["path"] ?? "")
        : (assessment.pathTargets?.[0] ?? "");
      return `${ctx.toolName} modifies a permission control-plane file${target ? `: ${target}` : ""}. ` +
        `Changes here alter what runs without approval.`;
    }

    // Bash: include the command text
    if ((ctx.toolName === "bash" || ctx.toolName === "bash_background") && ctx.toolArgs) {
      const command = typeof (ctx.toolArgs as Record<string, unknown>)["command"] === "string"
        ? (ctx.toolArgs as Record<string, unknown>)["command"] as string
        : "";
      if (command) {
        if (cls === "catastrophic") {
          return `DANGEROUS: ${command}`;
        }
        if (assessment.externalCwd) {
          const where = assessment.externalCwd === EXTERNAL_CWD_UNKNOWN
            ? "an unresolved directory"
            : assessment.externalCwd;
          return `bash in external directory ${where}: ${command}`;
        }
        return command;
      }
    }

    if (cls === "catastrophic") {
      return `DANGEROUS: ${ctx.toolName} — this operation could cause irreversible damage. ${ctx.summary}`;
    }
    if (cls === "write_danger") {
      return `${ctx.toolName} is a potentially dangerous operation. ${ctx.summary}`;
    }
    return `${ctx.toolName} requires approval. ${ctx.summary}`;
  }
}

function maxClass(a: PermissionClass, b: PermissionClass): PermissionClass {
  return PERMISSION_CLASS_ORDER[a] >= PERMISSION_CLASS_ORDER[b] ? a : b;
}
