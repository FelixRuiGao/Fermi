/**
 * Decision matrix and approval-offer policy — the explicit table that
 * replaced the fragile if-return chain (the old ordering handed
 * read_only a mode-upgrade offer even for catastrophic commands and
 * external-cwd bash, F-1/F-32).
 *
 * Offer scenarios are matched in a fixed priority order; each returns a
 * complete offer set:
 *   1. control-plane write / catastrophic → Allow once only, every mode
 *   2. external-cwd bash                  → Allow once only
 *   3. read_only                          → Allow once + mode upgrade
 *   4. normal                             → Allow once + persistence offers
 */

import type {
  ApprovalOffer,
  InvocationAssessment,
  PermissionClass,
  PermissionMode,
  ToolPatternRule,
} from "./types.js";
import { PERMISSION_CLASS_ORDER } from "./types.js";
import { isBroadDangerPattern } from "./command-policy.js";

// ------------------------------------------------------------------
// Decision matrix (mode × class → allow/ask)
// ------------------------------------------------------------------

export function applyDecisionMatrix(
  mode: PermissionMode,
  cls: PermissionClass,
): "allow" | "ask" {
  // Catastrophic ALWAYS asks, even in yolo. (Best-effort detection —
  // this is a last-chance reminder for direct spellings, not a security
  // boundary; see permissions.md.)
  if (cls === "catastrophic") return "ask";

  // Read and spawn are always allowed
  if (cls === "read" || cls === "spawn") return "allow";

  switch (mode) {
    case "yolo":
      return "allow";
    case "reversible":
      return cls === "write_reversible" ? "allow" : "ask";
    case "read_only":
      return "ask";
  }
}

// ------------------------------------------------------------------
// Offer policy
// ------------------------------------------------------------------

export interface OfferPolicyContext {
  mode: PermissionMode;
  assessment: InvocationAssessment;
  /** Project-scoped persistence available (session has a store)? */
  hasProjectScope: boolean;
}

const ALLOW_ONCE: ApprovalOffer = { type: "tool_once", label: "Allow once" };

function scopeLabel(scope: "session" | "project" | "global"): string {
  return scope === "session" ? "in this session"
    : scope === "project" ? "in this project"
    : "globally";
}

export function buildApprovalOffers(ctx: OfferPolicyContext): ApprovalOffer[] {
  const { mode, assessment } = ctx;

  // 1. Control-plane writes and catastrophic operations: a one-shot
  //    grant is the ONLY affordance — no mode upgrade, no persistence,
  //    in read_only included.
  if (assessment.controlPlane || assessment.permissionClass === "catastrophic") {
    return [ALLOW_ONCE];
  }

  // 2. External-cwd bash: one-shot only (no persistent rules for
  //    external shell contexts).
  if (assessment.externalCwd) {
    return [ALLOW_ONCE];
  }

  // 3. read_only: the mode is the reason we're asking — offer the
  //    session-scoped upgrade, no persistence (mode is a hard ceiling).
  if (mode === "read_only") {
    return [
      ALLOW_ONCE,
      { type: "mode_upgrade", label: "Switch session to reversible and allow" },
    ];
  }

  // 4. Normal ask: one-shot + persistence offers when memoizable.
  const offers: ApprovalOffer[] = [ALLOW_ONCE];
  if (!assessment.canMemoize) return offers;

  const cls = assessment.permissionClass;
  const pattern = assessment.canonicalPattern;

  // Scope tiers: bare broad danger commands ("rm", "chmod", ...) are
  // session-only — a persistent bare-"rm" allow is a standing footgun.
  // Subcommand-shaped danger patterns ("git push") keep all tiers; the
  // maxClass ceiling recorded on the rule stops class escalation.
  let scopes: Array<"session" | "project" | "global">;
  if (PERMISSION_CLASS_ORDER[cls] >= PERMISSION_CLASS_ORDER["write_danger"]) {
    scopes = pattern && !isBroadDangerPattern(pattern)
      ? ["session", "project", "global"]
      : ["session"];
  } else {
    scopes = ["session", "project", "global"];
  }
  if (!ctx.hasProjectScope) scopes = scopes.filter((s) => s !== "project");

  const tool = assessment.toolName;
  for (const scope of scopes) {
    const rule: Omit<ToolPatternRule, "id" | "createdAt"> = {
      type: "tool_pattern",
      action: "allow",
      tool,
      maxClass: cls,
      scope,
    };
    if (pattern) rule.pattern = pattern;
    offers.push({
      type: "tool_pattern",
      label: pattern
        ? `Always allow "${pattern}" ${scopeLabel(scope)}`
        : `Always allow ${tool} ${scopeLabel(scope)}`,
      scope,
      rule: rule as ToolPatternRule,
    });
  }

  return offers;
}

/**
 * Warning line shown above persistence offers for patterns that cover
 * a dangerously broad surface (bare cp/mv match every invocation of
 * the command). Bare danger-tier commands no longer get persistent
 * offers at all, so the warning only concerns the potent tier.
 */
export function buildPersistentWarning(assessment: InvocationAssessment, offers: ApprovalOffer[]): string | undefined {
  const BROAD_POTENT_COMMANDS = new Set(["cp", "mv"]);
  const hasPersistent = offers.some((o) => o.type === "tool_pattern");
  const pattern = assessment.canonicalPattern ?? "";
  if (hasPersistent && BROAD_POTENT_COMMANDS.has(pattern)) {
    return `Persistent rules below will apply to ALL "${pattern}" commands, which may cause DANGER.`;
  }
  return undefined;
}
