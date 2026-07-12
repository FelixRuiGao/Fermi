export { classifyTool, classifyToolAsync, initBashParser } from "./classify.js";
export { PermissionRuleStore } from "./rules.js";
export type { RuleLoadError, RuleMatch, RuleScope } from "./rules.js";
export { PermissionAdvisor } from "./advisor.js";
export { resolveCdContextParsed } from "./cd-context.js";
export { evaluatePathAccess, canonicalizePath, isCanonicallyWithin, externalDirPrefix } from "./path-access.js";
export { isControlPlanePath } from "./control-plane.js";
export { computeArgsDigest, ExecutionGrantStore } from "./grants.js";
export { applyDecisionMatrix, buildApprovalOffers, buildPersistentWarning } from "./policy.js";
export type {
  PermissionMode,
  PermissionClass,
  PermissionRule,
  ToolPatternRule,
  ExternalPathRule,
  PermissionRuleFile,
  InvocationAssessment,
  AdvisorDecision,
  ApprovalOffer,
  ApprovalOfferType,
} from "./types.js";
export {
  effectiveMode,
  PERMISSION_MODE_ORDER,
  PERMISSION_CLASS_ORDER,
  EXTERNAL_CWD_UNKNOWN,
} from "./types.js";
