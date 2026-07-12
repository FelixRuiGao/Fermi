/**
 * Workspace trust — the gate in front of repo-shipped executable
 * configuration.
 *
 * A repository can carry three kinds of config that execute code or
 * widen permissions on the host the moment the project is opened:
 *   1. `{projectRoot}/.fermi/settings.json` → `mcp_servers` (process
 *      spawn / outbound connections),
 *   2. `{projectRoot}/.fermi/hooks/**` → hook manifests (process spawn
 *      on session events),
 *   3. `{projectRoot}/.fermi/permissions.json` → allow rules (silent
 *      approval widening).
 *
 * None of it loads until the user has trusted THIS content once: the
 * decision is recorded outside the repo (projectStore trust.json) and
 * bound to a digest of the normalized content — any change flips the
 * workspace back to untrusted and the gate re-asks. Deny rules in the
 * workspace permissions file always apply (no exploitation surface).
 *
 * Consumers: both bootstraps (TUI, server) and Session.reloadMcp gate
 * MCP config; hook loading filters the workspace root; the rule store
 * gates workspace allow rules via a live predicate.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseJsonc } from "../jsonc.js";

export type WorkspaceTrustStatus = "trusted" | "untrusted" | "denied" | "empty";

export interface WorkspaceTrustSummary {
  mcpServers: Array<{ name: string; detail: string }>;
  hooks: Array<{ name: string; detail: string }>;
  allowRuleCount: number;
}

export interface WorkspaceTrustState {
  status: WorkspaceTrustStatus;
  /** Digest of the current workspace executable config; null when empty. */
  digest: string | null;
  summary: WorkspaceTrustSummary;
}

interface TrustRecordFile {
  version: 1;
  digest: string;
  decision: "trusted" | "denied";
  decidedAt: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys.map((k) =>
    JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]),
  ).join(",") + "}";
}

function readJsonQuiet(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null;
    return parseJsonc<Record<string, unknown>>(readFileSync(filePath, "utf-8")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Collect the workspace's executable configuration and digest it.
 * Digest input is the normalized parsed content (key-sorted), so
 * formatting-only edits don't re-trigger the trust prompt.
 */
export function collectWorkspaceExecutableConfig(projectRoot: string): {
  digest: string | null;
  summary: WorkspaceTrustSummary;
} {
  const fermiDir = join(projectRoot, ".fermi");
  const summary: WorkspaceTrustSummary = { mcpServers: [], hooks: [], allowRuleCount: 0 };
  const digestPayload: Record<string, unknown> = {};

  // 1. settings.json → mcp_servers
  const settings = readJsonQuiet(join(fermiDir, "settings.json"));
  const mcpServers = settings?.["mcp_servers"];
  if (mcpServers && typeof mcpServers === "object" && Object.keys(mcpServers as object).length > 0) {
    digestPayload["mcp_servers"] = mcpServers;
    for (const [name, cfg] of Object.entries(mcpServers as Record<string, unknown>)) {
      const c = (cfg ?? {}) as Record<string, unknown>;
      const detail = typeof c["command"] === "string"
        ? [c["command"], ...(Array.isArray(c["args"]) ? c["args"] : [])].join(" ")
        : typeof c["url"] === "string" ? String(c["url"]) : "(unrecognized)";
      summary.mcpServers.push({ name, detail });
    }
  }

  // 2. hooks/**/hook.json
  const hooksDir = join(fermiDir, "hooks");
  const hookManifests: Array<Record<string, unknown>> = [];
  try {
    if (existsSync(hooksDir) && statSync(hooksDir).isDirectory()) {
      for (const entry of readdirSync(hooksDir).sort()) {
        const manifest = readJsonQuiet(join(hooksDir, entry, "hook.json"));
        if (!manifest) continue;
        hookManifests.push(manifest);
        const detail = [manifest["command"], ...(Array.isArray(manifest["args"]) ? manifest["args"] : [])]
          .filter((v) => typeof v === "string").join(" ");
        summary.hooks.push({ name: entry, detail: detail || "(no command)" });
      }
    }
  } catch { /* unreadable hooks dir → treated as absent */ }
  if (hookManifests.length > 0) digestPayload["hooks"] = hookManifests;

  // 3. permissions.json → allow rules only (deny rules always apply and
  //    are excluded from the digest so adding a deny never re-prompts).
  const permissions = readJsonQuiet(join(fermiDir, "permissions.json"));
  const rules = Array.isArray(permissions?.["rules"]) ? permissions!["rules"] as unknown[] : [];
  const allowRules = rules.filter((r) =>
    r && typeof r === "object" && (r as Record<string, unknown>)["action"] === "allow");
  if (allowRules.length > 0) {
    digestPayload["allow_rules"] = allowRules;
    summary.allowRuleCount = allowRules.length;
  }

  if (Object.keys(digestPayload).length === 0) {
    return { digest: null, summary };
  }
  const digest = createHash("sha256").update(stableStringify(digestPayload)).digest("hex");
  return { digest, summary };
}

function trustRecordPath(projectStoreDir: string): string {
  return join(projectStoreDir, "trust.json");
}

function readTrustRecord(projectStoreDir: string): TrustRecordFile | null {
  const raw = readJsonQuiet(trustRecordPath(projectStoreDir));
  if (!raw) return null;
  if (raw["version"] !== 1) return null;
  if (typeof raw["digest"] !== "string") return null;
  if (raw["decision"] !== "trusted" && raw["decision"] !== "denied") return null;
  return raw as unknown as TrustRecordFile;
}

/**
 * Evaluate the workspace's trust state: collect + compare against the
 * recorded decision. Without a project store, nothing can be recorded,
 * so any executable config stays untrusted.
 */
export function evaluateWorkspaceTrust(
  projectRoot: string,
  projectStoreDir: string | undefined,
): WorkspaceTrustState {
  const { digest, summary } = collectWorkspaceExecutableConfig(projectRoot);
  if (digest === null) {
    return { status: "empty", digest: null, summary };
  }
  if (!projectStoreDir) {
    return { status: "untrusted", digest, summary };
  }
  const record = readTrustRecord(projectStoreDir);
  if (!record || record.digest !== digest) {
    return { status: "untrusted", digest, summary };
  }
  return { status: record.decision === "trusted" ? "trusted" : "denied", digest, summary };
}

/** Record a trust decision for the CURRENT content digest. */
export function recordWorkspaceTrustDecision(
  projectStoreDir: string,
  digest: string,
  decision: "trusted" | "denied",
): void {
  const record: TrustRecordFile = {
    version: 1,
    digest,
    decision,
    decidedAt: new Date().toISOString(),
  };
  const filePath = trustRecordPath(projectStoreDir);
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp." + process.pid;
  writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n", "utf-8");
  renameSync(tmp, filePath);
}

/** Workspace executable config may load? (trusted, or nothing to gate) */
export function workspaceExecutablesAllowed(state: WorkspaceTrustState): boolean {
  return state.status === "trusted" || state.status === "empty";
}
