/**
 * Tool classification — maps a tool call to an InvocationAssessment.
 *
 * This is the orchestration layer: parsing (tree-sitter, lazy-loaded),
 * cd-context resolution, per-segment classification, memoization
 * eligibility, and external write-target extraction. The per-command
 * classification tables and interpreters live in command-policy.ts.
 *
 * The sync classifyTool returns a conservative write_potent for shell
 * tools; all real shell classification goes through classifyToolAsync.
 */

import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { InvocationAssessment, PermissionClass } from "./types.js";
import { PERMISSION_CLASS_ORDER, EXTERNAL_CWD_UNKNOWN } from "./types.js";
import type { BashToken, ParsedBashCommand, ParsedBashSegment } from "./bash/types.js";
import { parseTrackableBashMutation } from "../tools/basic.js";
import { osCapabilities } from "../platform/index.js";
import type { OsCapabilities, ShellKind } from "../platform/types.js";
import { resolveCdContextParsed, type SegmentCwdInfo } from "./cd-context.js";
import { evaluatePathAccess } from "./path-access.js";
import {
  BASH_DYNAMIC_REVERSIBLE,
  buildCanonicalPatternFromParsed,
  classifyBashCommand,
  classifyPSCommand,
  envAssignmentsEscalate,
  extractGitCwdOverride,
  gitArgvParseIsAmbiguous,
  isPathQualifiedName,
  isPSCwdCommand,
  makeClassifyCtx,
  normalizedCommandName,
  resolvePSCommandName,
  stripWrappersFromParsed,
} from "./command-policy.js";

// ------------------------------------------------------------------
// Tree-sitter parser (lazy async init)
// ------------------------------------------------------------------

let parserReady: Promise<typeof import("./bash/parser.js")> | null = null;
let parserModule: typeof import("./bash/parser.js") | null = null;

export function initBashParser(): void {
  if (parserReady) return;
  parserReady = import("./bash/parser.js").then(async (mod) => {
    await mod.getParser();
    parserModule = mod;
    return mod;
  }).catch((err) => {
    console.warn("tree-sitter shell parser failed to load:", err);
    parserModule = null;
    return null as any;
  });
}

function isPowerShellKind(kind?: ShellKind): boolean {
  return kind === "pwsh" || kind === "powershell";
}

// ------------------------------------------------------------------
// Static tool classification (built-in, non-shell tools)
// ------------------------------------------------------------------

const READ_TOOLS = new Set([
  "read_file", "list_dir", "glob", "grep",
  // Network reads are "read": read_only constrains local state, not
  // connectivity (product decision 2026-07-11; exfiltration is outside
  // this threat model).
  "web_fetch", "web_search", "$web_search",
  "show_context", "summarize_context",
  "ask", "check_status", "await_event", "send",
  "bash_output", "skill", "reload", "time",
  // kill_shell terminates agent-spawned background shells only —
  // agent-owned scratch processes, like the artifacts dir.
  "kill_shell",
  // Pure session-state transitions — no filesystem or external effect.
  "create_goal", "update_goal",
]);

const WRITE_REVERSIBLE_TOOLS = new Set([
  "write_file", "edit_file",
]);

const SPAWN_TOOLS = new Set([
  "spawn",
]);

const WRITE_DANGER_TOOLS = new Set([
  "kill_agent",
]);

// ------------------------------------------------------------------
// classifyTool — sync entry point (non-bash only)
// ------------------------------------------------------------------

export function classifyTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
): InvocationAssessment {
  if (toolName.startsWith("mcp__")) {
    return { permissionClass: "write_potent", toolName, canMemoize: true };
  }
  if (READ_TOOLS.has(toolName)) {
    return { permissionClass: "read", toolName };
  }
  if (WRITE_REVERSIBLE_TOOLS.has(toolName)) {
    return { permissionClass: "write_reversible", toolName, canMemoize: true };
  }
  if (SPAWN_TOOLS.has(toolName)) {
    return { permissionClass: "spawn", toolName };
  }
  if (WRITE_DANGER_TOOLS.has(toolName)) {
    return { permissionClass: "write_danger", toolName };
  }

  if (toolName === "bash" || toolName === "bash_background") {
    return { permissionClass: "write_potent", toolName, canMemoize: false };
  }

  return { permissionClass: "write_potent", toolName, canMemoize: true };
}

// ------------------------------------------------------------------
// classifyToolAsync — tree-sitter shell classification
// ------------------------------------------------------------------

export async function classifyToolAsync(
  toolName: string,
  toolArgs: Record<string, unknown>,
  projectRoot?: string,
  shellKind?: ShellKind,
  caps: OsCapabilities = osCapabilities,
): Promise<InvocationAssessment> {
  if (toolName !== "bash" && toolName !== "bash_background") {
    return classifyTool(toolName, toolArgs);
  }

  const command = typeof toolArgs["command"] === "string" ? toolArgs["command"] : "";
  if (!command.trim()) {
    return { permissionClass: "write_potent", toolName };
  }

  // Ensure parser is loaded (self-init on first use)
  if (!parserModule) {
    if (!parserReady) initBashParser();
    if (parserReady) await parserReady;
  }
  if (!parserModule) {
    return { permissionClass: "write_potent", toolName, canMemoize: false };
  }

  const usePS = isPowerShellKind(shellKind);
  const result = usePS
    ? await parserModule.parsePowerShellCommand(command)
    : await parserModule.parseBashCommand(command);
  if (result.kind === "unsupported") {
    return { permissionClass: "write_potent", toolName, canMemoize: false };
  }

  const bashCwd = typeof toolArgs["cwd"] === "string" ? toolArgs["cwd"] : undefined;
  const defaultCwd = projectRoot ? path.resolve(projectRoot) : process.cwd();
  const effectiveCwd = bashCwd
    ? path.resolve(defaultCwd, bashCwd)
    : defaultCwd;

  // Phase 1: cd context resolution (bash only — PowerShell's cd can
  // navigate provider paths the resolver doesn't understand; PS cwd
  // cmdlets are classified write_potent and poison memoization below).
  let segments = result.segments as ParsedBashSegment[];
  let segmentCwds: SegmentCwdInfo[];
  let cdEffectiveCwd = effectiveCwd;
  let anyExternal = false;
  let externalUnresolvable = false;

  if (projectRoot && !usePS) {
    const cdCtx = resolveCdContextParsed(segments, projectRoot, effectiveCwd);
    segments = cdCtx.segments as ParsedBashSegment[];
    segmentCwds = cdCtx.segmentCwds;
    cdEffectiveCwd = cdCtx.effectiveCwd;
    anyExternal = cdCtx.isExternal;
    externalUnresolvable = cdCtx.unresolvable;
  } else {
    // PS / no projectRoot: uniform cwd, external iff the initial cwd is
    // (canonically) outside the project.
    let initialExternal = false;
    if (projectRoot) {
      initialExternal = evaluatePathAccess(effectiveCwd, { projectRoot }).isExternal;
    }
    segmentCwds = segments.map(() => ({
      cwd: effectiveCwd,
      isExternal: initialExternal,
      unresolvable: false,
    }));
    anyExternal = initialExternal && segments.length > 0;
  }

  const psHasCwdCmd = usePS &&
    segments.some((seg) => seg.commands.some((c) => isPSCwdCommand(c, caps)));

  // Phase 2: classify each segment, collect command names and max class.
  // `git -C <external>` marks its segment as external context (same
  // treatment as cd).
  let maxClass: PermissionClass = "read";
  const allCommandNames: string[] = [];
  const segmentClasses: PermissionClass[] = [];
  const segmentGitCwdExternal: Array<string | null> = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const info = segmentCwds[i] ?? { cwd: effectiveCwd, isExternal: false, unresolvable: false };
    const ctx = makeClassifyCtx(info.cwd, caps);
    let segClass: PermissionClass = "read";
    let gitCwdExternal: string | null = null;
    for (const cmd of segment.commands) {
      const stripped = usePS ? cmd : stripWrappersFromParsed(cmd, caps);
      const cls = usePS ? classifyPSCommand(stripped, ctx) : classifyBashCommand(stripped, ctx);
      allCommandNames.push(usePS ? resolvePSCommandName(stripped.name, caps) : normalizedCommandName(stripped.name, caps));
      if (PERMISSION_CLASS_ORDER[cls] > PERMISSION_CLASS_ORDER[segClass]) segClass = cls;

      if (!usePS && projectRoot && !info.unresolvable) {
        const cwdOverride = extractGitCwdOverride(stripped);
        if (cwdOverride) {
          const access = evaluatePathAccess(cwdOverride, { projectRoot, cwd: info.cwd });
          if (access.isExternal) gitCwdExternal = access.resolvedPath;
        }
      }
    }
    if (segment.hasFileWriteRedirect && PERMISSION_CLASS_ORDER[segClass] < PERMISSION_CLASS_ORDER["write_potent"]) {
      segClass = "write_potent";
    }
    segmentClasses.push(segClass);
    segmentGitCwdExternal.push(gitCwdExternal);
    if (gitCwdExternal) anyExternal = true;
    if (PERMISSION_CLASS_ORDER[segClass] > PERMISSION_CLASS_ORDER[maxClass]) maxClass = segClass;
  }

  // External-cwd ask trigger: only when a NON-READ segment runs in an
  // external context (reads from an external cwd are free, matching the
  // bash-reads-are-free policy). Read-only external context still
  // disables memoization below.
  let externalCwdForAsk: string | undefined;
  for (let i = 0; i < segments.length; i++) {
    const info = segmentCwds[i]!;
    const gitTarget = segmentGitCwdExternal[i];
    if ((info.isExternal || gitTarget) && segmentClasses[i] !== "read") {
      externalCwdForAsk = info.unresolvable || externalUnresolvable
        ? EXTERNAL_CWD_UNKNOWN
        : (info.isExternal ? info.cwd : gitTarget!);
      break;
    }
  }

  // Phase 3: safe segment stripping — if only one non-read segment,
  // keep it as the memoization subject. Disabled for PowerShell command
  // lists containing cwd cmdlets: stripping there memoized
  // "set-location" and a persisted rule silently re-approved the
  // read-after-cd payload (P1-4).
  let effectiveSegments = segments;
  if (segments.length > 1 && !(usePS && psHasCwdCmd)) {
    const nonSafeIndices = segmentClasses
      .map((cls, i) => cls !== "read" ? i : -1)
      .filter(i => i >= 0);
    if (nonSafeIndices.length === 1) {
      effectiveSegments = [segments[nonSafeIndices[0]!]!];
    }
  }

  // Phase 4: memoization eligibility + canonical pattern
  const single = effectiveSegments.length === 1 && effectiveSegments[0]!.commands.length === 1
    ? effectiveSegments[0]!
    : null;
  const singleStripped = single
    ? (usePS ? single.commands[0]! : stripWrappersFromParsed(single.commands[0]!, caps))
    : null;

  const canMemoize = !!single && !!singleStripped &&
    maxClass !== "catastrophic" &&
    !anyExternal &&
    !(usePS && psHasCwdCmd) &&
    // A file-write redirect is an escalation source the pattern can't
    // encode — "Always allow echo" must not cover `echo x > file`.
    !single.hasFileWriteRedirect &&
    // Path-qualified names and resolution-affecting env prefixes make
    // the inner name untrustworthy; a persisted rule would over-grant.
    !isPathQualifiedName(singleStripped.name) &&
    !envAssignmentsEscalate(singleStripped) &&
    // A git flag cluster the arity table cannot fully parse may carry
    // phantom risk flags; a pattern built from it could over-cover.
    !gitArgvParseIsAmbiguous(singleStripped, caps);

  const canonicalPattern = canMemoize && singleStripped
    ? (usePS
        ? resolvePSCommandName(singleStripped.name, caps)
        : buildCanonicalPatternFromParsed(singleStripped, caps))
    : undefined;

  const assessment: InvocationAssessment = {
    permissionClass: maxClass,
    toolName,
    commands: allCommandNames,
    canonicalPattern,
    canMemoize,
  };

  if (externalCwdForAsk) {
    assessment.externalCwd = externalCwdForAsk;
  }

  // Phase 5: dynamic cp/mv check (target is existing directory → write_potent)
  if (!usePS && assessment.permissionClass === "write_reversible" &&
      allCommandNames.some(c => BASH_DYNAMIC_REVERSIBLE.has(c))) {
    outer:
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const segCwd = segmentCwds[i]?.cwd ?? cdEffectiveCwd;
      for (const cmd of seg.commands) {
        const stripped = stripWrappersFromParsed(cmd, caps);
        if (!BASH_DYNAMIC_REVERSIBLE.has(normalizedCommandName(stripped.name, caps))) continue;
        const parsed = parseTrackableBashMutation(seg.text);
        if (!parsed) {
          assessment.permissionClass = "write_potent";
          break outer;
        }
        const rawTarget = parsed.args[parsed.args.length - 1];
        if (rawTarget) {
          const resolvedTarget = path.isAbsolute(rawTarget)
            ? path.resolve(rawTarget)
            : path.resolve(segCwd, rawTarget);
          try {
            if (statSync(resolvedTarget).isDirectory()) {
              assessment.permissionClass = "write_potent";
              break outer;
            }
          } catch { /* target doesn't exist — stays reversible */ }
        }
      }
    }
  }

  // Phase 6: external write-target extraction (bash only). Literal
  // targets of write-shaped commands and file redirects that resolve
  // (canonically) outside projectRoot route through the external_path
  // gate in the advisor — same rules and prefixes as the file tools.
  if (!usePS && projectRoot) {
    const externalTargets: string[] = [];
    const pathTargets: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const info = segmentCwds[i] ?? { cwd: effectiveCwd, isExternal: false, unresolvable: false };
      for (const rawTarget of collectSegmentWriteTargets(seg, caps)) {
        const expanded = expandHomePrefix(rawTarget);
        // Relative targets under an unresolvable cwd can't be judged.
        if (info.unresolvable && !path.isAbsolute(expanded)) continue;
        const access = evaluatePathAccess(expanded, { projectRoot, cwd: info.cwd });
        pathTargets.push(access.resolvedPath);
        if (access.isExternal) externalTargets.push(access.canonicalPath);
      }
    }
    if (pathTargets.length > 0) assessment.pathTargets = pathTargets;
    if (externalTargets.length > 0) assessment.externalWriteTargets = externalTargets;
  }

  return assessment;
}

// ------------------------------------------------------------------
// External write-target extraction helpers
// ------------------------------------------------------------------

// Write-shaped commands whose literal targets are worth external-path
// gating. Variable/glob/concatenation targets stay unextracted —
// documented best-effort, not a boundary.
const EXTERNAL_WRITE_COMMANDS = new Set(["cp", "mv", "mkdir", "touch", "ln", "tee"]);

function literalValue(t: BashToken): string | null {
  if (t.kind === "literal" || t.kind === "home_reference") return t.value;
  return null;
}

function expandHomePrefix(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  if (p === "$HOME") return homedir();
  if (p.startsWith("$HOME/")) return path.join(homedir(), p.slice("$HOME/".length));
  return p;
}

function collectSegmentWriteTargets(seg: ParsedBashSegment, caps: OsCapabilities): string[] {
  const targets: string[] = [];

  for (const raw of seg.fileRedirectTargets ?? []) {
    targets.push(raw);
  }

  for (const cmd of seg.commands) {
    const stripped = stripWrappersFromParsed(cmd, caps);
    const name = normalizedCommandName(stripped.name, caps);
    if (!EXTERNAL_WRITE_COMMANDS.has(name)) continue;

    const argv = stripped.argv;
    const posTokens: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const t = argv[i]!;
      if (t.value.startsWith("-")) {
        // -t/--target-directory carries the real destination for cp/mv.
        if ((t.value === "-t" || t.value === "--target-directory") && argv[i + 1]) {
          const v = literalValue(argv[i + 1]!);
          if (v) targets.push(v);
          i++;
        }
        continue;
      }
      const v = literalValue(t);
      if (v !== null) posTokens.push(v);
    }

    switch (name) {
      case "cp":
      case "mv":
      case "ln":
        // Destination is the final positional (sources are reads).
        if (posTokens.length >= 2) targets.push(posTokens[posTokens.length - 1]!);
        break;
      case "mkdir":
      case "touch":
      case "tee":
        targets.push(...posTokens.filter((v) => v !== "/dev/null"));
        break;
    }
  }

  return targets;
}
