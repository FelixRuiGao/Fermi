/**
 * Command classification policy — the data layer of bash/PowerShell/git
 * classification.
 *
 * Tables are data (command name → class or a small argv classifier);
 * cross-cutting logic lives in a handful of interpreter functions
 * (wrapper stripping, sudo/`sh -c`/xargs recursion, rm aggregation).
 * classify.ts orchestrates parsing/segments/memoization and calls in
 * here per command.
 *
 * Every classifier here is a pure function of (parsed command, ctx);
 * ctx carries the effective cwd and the OS capability table so tests
 * can exercise Windows behavior on any host.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { OsCapabilities } from "../platform/types.js";
import { osCapabilities } from "../platform/index.js";
import type { BashToken, ParsedBashCommand } from "./bash/types.js";
import { parseBashCommandSync } from "./bash/parser.js";
import type { PermissionClass } from "./types.js";
import { PERMISSION_CLASS_ORDER } from "./types.js";

export interface ClassifyCtx {
  /** cwd the command effectively runs in (after cd-context resolution). */
  effectiveCwd: string;
  /** Injectable capability table; defaults to the platform singleton. */
  caps: OsCapabilities;
  /** Wrapper recursion depth guard (sudo → sh -c → ...). */
  depth: number;
}

export function makeClassifyCtx(effectiveCwd: string, caps: OsCapabilities = osCapabilities): ClassifyCtx {
  return { effectiveCwd, caps, depth: 0 };
}

const MAX_WRAPPER_DEPTH = 2;

export function maxOfClasses(a: PermissionClass, b: PermissionClass): PermissionClass {
  return PERMISSION_CLASS_ORDER[a] >= PERMISSION_CLASS_ORDER[b] ? a : b;
}

type CmdClassifier = (cmd: ParsedBashCommand, ctx: ClassifyCtx) => PermissionClass;

// ------------------------------------------------------------------
// Command name normalization
// ------------------------------------------------------------------

/** True when the command was invoked via an explicit path (./cat, /tmp/ls). */
export function isPathQualifiedName(rawName: string): boolean {
  return rawName.includes("/") || rawName.includes("\\");
}

/**
 * Basename of a command with platform folding applied:
 *  - implicit executable extensions stripped (Windows PATHEXT: `rm.exe`
 *    resolves to the same binary as `rm`; empty list on POSIX),
 *  - case folded on case-insensitive filesystems.
 *
 * MUST be used by EVERY layer that matches a command name against a
 * safety set — wrapper stripping, danger/catastrophic classification,
 * and the cp/mv escalation. Folding in only one layer lets a variant
 * spelling slip past an earlier case-sensitive layer and land on a more
 * permissive branch (see the `ENV rm -rf ~` example in git history).
 */
export function normalizedCommandName(rawName: string, caps: OsCapabilities = osCapabilities): string {
  let base = rawName.split(/[\\/]/).pop() ?? rawName;
  const lower = base.toLowerCase();
  for (const ext of caps.strippableExecutableExtensions) {
    if (lower.endsWith(ext) && base.length > ext.length) {
      base = base.slice(0, base.length - ext.length);
      break;
    }
  }
  return caps.caseInsensitiveFilesystem ? base.toLowerCase() : base;
}

// ------------------------------------------------------------------
// Environment-assignment escalation
// ------------------------------------------------------------------

// Command-scoped assignments that change how the command name resolves
// or what code the process loads: the parsed inner name is then
// untrustworthy (`PATH=./bin cat` may run anything named cat).
const RESOLUTION_AFFECTING_ENV = /^(PATH|BASH_ENV|ENV|LD_[A-Z0-9_]+|DYLD_[A-Z0-9_]+|PYTHONPATH|NODE_OPTIONS|PERL5LIB|RUBYLIB|GEM_PATH)$/;

export function envAssignmentsEscalate(cmd: ParsedBashCommand): boolean {
  return (cmd.envAssignments ?? []).some((n) => RESOLUTION_AFFECTING_ENV.test(n));
}

// ------------------------------------------------------------------
// Bash tables
// ------------------------------------------------------------------

const readIf = (predicate: (cmd: ParsedBashCommand) => boolean, escalated: PermissionClass): CmdClassifier =>
  (cmd) => (predicate(cmd) ? escalated : "read");

const hasLiteralFlag = (cmd: ParsedBashCommand, re: RegExp): boolean =>
  cmd.argv.some((t) => t.kind === "literal" && re.test(t.value));

const positionals = (cmd: ParsedBashCommand): BashToken[] =>
  cmd.argv.filter((t) => !t.value.startsWith("-"));

/**
 * Read-tier commands. A plain "read" entry asserts that NO argument
 * form of the command has side effects; anything with a known output/
 * in-place/system-modifying option gets a classifier instead. New
 * entries default to the classifier form unless verified side-effect-free.
 */
const BASH_SAFE_COMMANDS = new Map<string, "read" | CmdClassifier>([
  ...([
    "ls", "ll", "la", "dir", "cat", "head", "tail", "less", "more",
    "wc", "file", "stat", "readlink", "realpath", "basename", "dirname",
    "grep", "egrep", "fgrep", "rg", "ag", "ack",
    "pwd", "whoami", "hostname", "uname", "arch", "id", "groups",
    "which", "where", "whence", "type",
    "echo", "printf", "true", "false", "test", "[", "[[", "expr", "seq",
    "cut", "tr", "paste", "nl", "rev", "fmt",
    "comm", "cmp", "diff",
    "jq",
    "env", "printenv", "uptime", "ps", "df", "du", "free",
    "lsof", "pgrep", "tput",
    "md5sum", "sha256sum", "shasum",
    "sleep",
    "cd",
  ].map((name) => [name, "read"] as const)),
  // Commands with mutating argument forms — classifier entries.
  ["tee", (cmd) => {
    // tee's whole job is writing files; only /dev/null targets are inert.
    const targets = positionals(cmd).filter((t) => t.value !== "/dev/null");
    return targets.length > 0 ? "write_potent" : "read";
  }],
  ["sort", readIf((cmd) => hasLiteralFlag(cmd, /^(-o.*|--output(=.*)?)$/), "write_potent")],
  ["uniq", readIf((cmd) => positionals(cmd).length >= 2, "write_potent")],
  ["tree", readIf((cmd) => hasLiteralFlag(cmd, /^(-o|--output(=.*)?)$/), "write_potent")],
  ["yq", readIf((cmd) => hasLiteralFlag(cmd, /^(-i|--inplace)$/), "write_potent")],
  ["base64", readIf((cmd) => hasLiteralFlag(cmd, /^(-o.*|--output(=.*)?)$/), "write_potent")],
  ["date", readIf((cmd) => hasLiteralFlag(cmd, /^(-s|--set(=.*)?)$/), "write_danger")],
]);

const BASH_REVERSIBLE_COMMANDS = new Set(["mkdir"]);
export const BASH_DYNAMIC_REVERSIBLE = new Set(["cp", "mv"]);

// POSIX-shared danger commands. Stored lowercase; lookup goes through
// normalizedCommandName which folds case only on case-insensitive
// filesystems (see its JSDoc).
const BASH_DANGER_COMMANDS = new Set([
  "rm", "rmdir",
  "sudo", "su", "doas",
  "chmod", "chown", "chgrp",
  "kill", "killall", "pkill",
  "reboot", "shutdown", "halt", "poweroff", "init",
  "mount", "umount",
  "iptables", "ip6tables", "nft",
  "systemctl", "service", "launchctl",
  "useradd", "userdel", "usermod", "groupadd", "groupdel",
  "passwd",
  "crontab",
]);

export function isDangerCommand(name: string, caps: OsCapabilities = osCapabilities): boolean {
  if (BASH_DANGER_COMMANDS.has(name)) return true;
  // Windows-specific names: lowercased compare so `REG`, `Reg`, `reg`
  // all flag (Git Bash uses Win32 case-insensitive file lookup).
  return caps.platformSpecificDangerCommands.has(name.toLowerCase());
}

const BASH_POTENT_COMMANDS = new Set([
  "touch", "ln",
  "npm", "npx", "pnpm", "yarn", "bun",
  "pip", "pip3", "uv",
  "cargo", "go",
  "python", "python3", "node", "deno",
  "ruby", "gem", "bundle",
  "java", "javac", "gradle", "mvn",
  "gcc", "g++", "clang", "clang++",
  "make", "cmake",
  "rustc",
  "docker", "podman", "kubectl",
  "sed", "awk",
  "curl", "wget",
  "tar", "gzip", "gunzip", "bzip2", "xz", "unzip", "zip",
  "scp", "rsync", "sftp",
  "tsc", "esbuild", "vite", "webpack", "rollup", "parcel",
  "jest", "vitest", "mocha", "pytest",
  "eslint", "prettier", "biome",
  "brew", "apt", "apt-get", "yum", "dnf", "pacman",
  "ssh-keygen",
  "openssl",
]);

const PROCESS_WRAPPERS = new Set([
  "timeout", "time", "nice", "nohup", "stdbuf", "command", "builtin",
]);

// ------------------------------------------------------------------
// Wrapper stripping (env / timeout / nice / command / ...)
// ------------------------------------------------------------------

/**
 * Unwrap process wrappers to the real command, iterating to a fixpoint
 * (`nohup timeout 5 rm ...` fully unwraps). `env`'s VAR=val arguments
 * are folded into the inner command's envAssignments so the PATH/LD_*
 * escalation sees them.
 */
export function stripWrappersFromParsed(
  cmd: ParsedBashCommand,
  caps: OsCapabilities = osCapabilities,
): ParsedBashCommand {
  let current = cmd;
  for (let round = 0; round < 4; round++) {
    const next = stripOneWrapper(current, caps);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function stripOneWrapper(cmd: ParsedBashCommand, caps: OsCapabilities): ParsedBashCommand {
  const name = normalizedCommandName(cmd.name, caps);

  if (name === "env") {
    const envAssignments: string[] = [...(cmd.envAssignments ?? [])];
    let idx = 0;
    while (idx < cmd.argv.length) {
      const token = cmd.argv[idx]!;
      if (token.kind === "literal" && token.value.includes("=") && !token.value.startsWith("-")) {
        const varName = token.value.split("=", 1)[0]!;
        if (varName) envAssignments.push(varName);
        idx++;
        continue;
      }
      if (token.kind === "literal" && token.value.startsWith("-")) { idx++; continue; }
      break;
    }
    if (idx < cmd.argv.length) {
      const newName = cmd.argv[idx]!;
      return {
        text: cmd.text,
        name: newName.value,
        nameToken: newName,
        argv: cmd.argv.slice(idx + 1),
        envAssignments: envAssignments.length > 0 ? envAssignments : undefined,
      };
    }
    return cmd;
  }

  if (!PROCESS_WRAPPERS.has(name)) return cmd;

  let skip = 0;
  while (skip < cmd.argv.length && cmd.argv[skip]!.value.startsWith("-")) skip++;
  if ((name === "timeout" || name === "stdbuf") && skip < cmd.argv.length) {
    if (!cmd.argv[skip]!.value.startsWith("-")) skip++;
  }
  if (skip < cmd.argv.length) {
    const newName = cmd.argv[skip]!;
    return {
      text: cmd.text,
      name: newName.value,
      nameToken: newName,
      argv: cmd.argv.slice(skip + 1),
      envAssignments: cmd.envAssignments,
    };
  }

  return cmd;
}

// ------------------------------------------------------------------
// Bash per-command classification
// ------------------------------------------------------------------

export function classifyBashCommand(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  const caps = ctx.caps;
  const name = normalizedCommandName(cmd.name, caps);
  let cls = classifyBashCommandInner(cmd, name, ctx);
  // A resolution-affecting env prefix makes the parsed name untrustworthy:
  // whatever the tables said, the floor is potent.
  if (envAssignmentsEscalate(cmd)) cls = maxOfClasses(cls, "write_potent");
  return cls;
}

function classifyBashCommandInner(
  cmd: ParsedBashCommand,
  name: string,
  ctx: ClassifyCtx,
): PermissionClass {
  const caps = ctx.caps;

  // Catastrophic: disk tools
  if (["mkfs", "fdisk", "parted", "wipefs", "shred", "dd"].includes(name)) {
    if (name === "dd") {
      const hasDevTarget = cmd.argv.some(
        (t) => t.kind === "literal" && /^of=\/dev\//.test(t.value),
      );
      if (hasDevTarget) return "catastrophic";
    } else {
      return "catastrophic";
    }
  }

  // Catastrophic: platform-specific disk-wipe tools (Windows
  // format/diskpart via Git Bash). Empty set on POSIX, so a command
  // coincidentally named `format` on a POSIX host is never mis-flagged.
  if (caps.platformSpecificCatastrophicCommands.has(name)) {
    return "catastrophic";
  }

  if (name === "rm" && rmIsCatastrophic(cmd, ctx)) return "catastrophic";

  if (cmd.argv.some((t) => t.value === "--no-preserve-root")) {
    return "catastrophic";
  }

  // Path-qualified names (./cat, /tmp/ls) never earn table trust: the
  // binary is whatever lives at that path, not the system tool the name
  // suggests. Danger/catastrophic basename matching above still applies
  // (conservative direction is harmless).
  if (isPathQualifiedName(cmd.name)) {
    return isDangerCommand(name, caps) ? "write_danger" : "write_potent";
  }

  // Wrapper recursion (best-effort catastrophic honesty; bounded depth).
  if ((name === "sudo" || name === "doas") && ctx.depth < MAX_WRAPPER_DEPTH) {
    return classifySudo(cmd, ctx);
  }
  if ((name === "bash" || name === "sh" || name === "zsh") && ctx.depth < MAX_WRAPPER_DEPTH) {
    return classifyShellDashC(cmd, ctx);
  }
  if (name === "xargs" && ctx.depth < MAX_WRAPPER_DEPTH) {
    return classifyXargs(cmd, ctx);
  }

  if (name === "git") return classifyGitDetailed(cmd, ctx);
  if (name === "find") return classifyFind(cmd, ctx);

  if (isDangerCommand(name, caps)) return "write_danger";
  if (BASH_REVERSIBLE_COMMANDS.has(name)) return "write_reversible";
  if (BASH_DYNAMIC_REVERSIBLE.has(name)) return "write_reversible";

  const safeEntry = BASH_SAFE_COMMANDS.get(name);
  if (safeEntry) return safeEntry === "read" ? "read" : safeEntry(cmd, ctx);

  if (BASH_POTENT_COMMANDS.has(name)) return "write_potent";

  return "write_potent";
}

// -- rm catastrophic aggregation --------------------------------------

function rmIsCatastrophic(cmd: ParsedBashCommand, ctx: ClassifyCtx): boolean {
  let hasRecursive = false;
  let hasForce = false;
  for (const t of cmd.argv) {
    if (t.kind !== "literal") continue;
    const v = t.value;
    if (v === "--recursive") { hasRecursive = true; continue; }
    if (v === "--force") { hasForce = true; continue; }
    if (/^-[a-zA-Z]+$/.test(v)) {
      if (/[rR]/.test(v)) hasRecursive = true;
      if (v.includes("f")) hasForce = true;
    }
  }
  if (!hasRecursive || !hasForce) return false;
  return cmd.argv.some((t) => !t.value.startsWith("-") && isDangerousRmTarget(t, ctx));
}

function isDangerousRmTarget(t: BashToken, ctx: ClassifyCtx): boolean {
  if (t.kind === "home_reference") return true;
  let v = t.value;
  if (v === "$HOME" || v.startsWith("$HOME/")) {
    v = v === "$HOME" ? "~" : "~" + v.slice("$HOME".length);
  }
  // Normalize: `/*` and `/foo/*` glob suffixes cover the directory itself;
  // trailing slashes are spelling variants (`~/` == `~`).
  v = v.replace(/\/+\*+$/, "");
  if (v === "") v = "/"; // was "/*"
  if (v.length > 1) v = v.replace(/\/+$/, "");
  if (v === "/" || v === "~" || v === "..") return true;
  if (t.kind !== "literal" && !v.startsWith("~")) return false;
  // Resolve remaining literal targets: `../..`-style paths that land on
  // the filesystem root or the home directory are the same catastrophe.
  try {
    const expanded = v === "~" ? homedir() : v.startsWith("~/") ? path.join(homedir(), v.slice(2)) : v;
    const resolved = path.resolve(ctx.effectiveCwd, expanded);
    if (resolved === path.parse(resolved).root) return true;
    if (resolved === homedir()) return true;
  } catch { /* ignore */ }
  return false;
}

// -- wrapper recursion --------------------------------------------------

const SUDO_VALUE_FLAGS = new Set(["-u", "-g", "-p", "-U", "-T", "-C", "-D", "-h", "-R"]);

function classifySudo(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  let i = 0;
  while (i < cmd.argv.length) {
    const v = cmd.argv[i]!.value;
    if (!v.startsWith("-")) break;
    i += SUDO_VALUE_FLAGS.has(v) ? 2 : 1;
  }
  if (i >= cmd.argv.length) return "write_danger";
  const innerToken = cmd.argv[i]!;
  const inner: ParsedBashCommand = {
    text: cmd.text,
    name: innerToken.value,
    nameToken: innerToken,
    argv: cmd.argv.slice(i + 1),
  };
  const innerClass = classifyBashCommand(
    stripWrappersFromParsed(inner, ctx.caps),
    { ...ctx, depth: ctx.depth + 1 },
  );
  return maxOfClasses("write_danger", innerClass);
}

function classifyShellDashC(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  const cIdx = cmd.argv.findIndex((t) => t.kind === "literal" && t.value === "-c");
  if (cIdx < 0) return "write_potent";
  const script = cmd.argv[cIdx + 1];
  // Only static literals can be analyzed; anything dynamic stays potent
  // (documented best-effort — this is a reminder, not a boundary).
  if (!script || script.kind !== "literal") return "write_potent";
  const parsed = parseBashCommandSync(script.value);
  if (!parsed || parsed.kind === "unsupported") return "write_potent";
  let innerMax: PermissionClass = "read";
  for (const seg of parsed.segments) {
    for (const c of seg.commands) {
      innerMax = maxOfClasses(
        innerMax,
        classifyBashCommand(stripWrappersFromParsed(c, ctx.caps), { ...ctx, depth: ctx.depth + 1 }),
      );
    }
  }
  return maxOfClasses("write_potent", innerMax);
}

const XARGS_VALUE_FLAGS = new Set(["-I", "-n", "-P", "-L", "-s", "-a", "-E", "-d", "-i"]);

function classifyXargs(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  let i = 0;
  while (i < cmd.argv.length) {
    const v = cmd.argv[i]!.value;
    if (!v.startsWith("-")) break;
    i += XARGS_VALUE_FLAGS.has(v) ? 2 : 1;
  }
  if (i >= cmd.argv.length) return "write_potent";
  const innerToken = cmd.argv[i]!;
  const inner: ParsedBashCommand = {
    text: cmd.text,
    name: innerToken.value,
    nameToken: innerToken,
    argv: cmd.argv.slice(i + 1),
  };
  const innerClass = classifyBashCommand(
    stripWrappersFromParsed(inner, ctx.caps),
    { ...ctx, depth: ctx.depth + 1 },
  );
  return maxOfClasses("write_potent", innerClass);
}

function classifyFind(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  let cls: PermissionClass = "read";
  const hasDelete = cmd.argv.some((t) => t.kind === "literal" && t.value === "-delete");
  if (hasDelete) {
    const root = cmd.argv.find((t) => !t.value.startsWith("-"));
    const dangerousRoot = root !== undefined &&
      (root.value === "/" || root.value === "~" || root.kind === "home_reference");
    cls = dangerousRoot ? "write_danger" : "write_potent";
  }
  const execIdx = cmd.argv.findIndex(
    (t) => t.kind === "literal" && /^-(exec|execdir|ok|okdir)$/.test(t.value),
  );
  if (execIdx >= 0) {
    const execCmd = cmd.argv[execIdx + 1];
    if (execCmd && ctx.depth < MAX_WRAPPER_DEPTH) {
      const inner: ParsedBashCommand = {
        text: cmd.text,
        name: execCmd.value,
        nameToken: execCmd,
        argv: [],
      };
      cls = maxOfClasses(cls, maxOfClasses(
        "write_potent",
        classifyBashCommand(inner, { ...ctx, depth: ctx.depth + 1 }),
      ));
    } else {
      cls = maxOfClasses(cls, "write_potent");
    }
  }
  return cls;
}

// ------------------------------------------------------------------
// Git detailed classification
// ------------------------------------------------------------------

// Flags whose next token is a value, not a flag/positional. Without
// skipping these, `git -C /tmp push` reads "/tmp" as the subcommand and
// `git commit -m "-f"` reads a commit message as a force flag.
const GIT_VALUE_FLAGS = new Set([
  "-C", "-c", "--git-dir", "--work-tree", "--namespace",
  "-m", "--message", "-F", "--file", "--author", "--date",
]);

const GIT_SAFE_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show",
  "rev-parse",
  "ls-files", "ls-tree", "ls-remote",
  "describe", "shortlog", "blame", "annotate",
  "name-rev", "rev-list",
  "cat-file",
  "count-objects", "verify-pack",
  "for-each-ref",
]);

const GIT_REVERSIBLE_SUBCOMMANDS = new Set([
  "add", "commit", "fetch", "pull",
  "merge",
  "cherry-pick",
  "init",
]);

const GIT_DANGER_SUBCOMMANDS = new Set([
  "push", "rebase",
]);

interface GitParts {
  positionals: string[];
  flags: Set<string>;
  /** Value of `-C <path>` when present (affects effective cwd). */
  cwdOverride?: string;
}

function splitGitArgv(cmd: ParsedBashCommand): GitParts {
  const parts: GitParts = { positionals: [], flags: new Set<string>() };
  const argv = cmd.argv;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.kind !== "literal") continue;
    const v = token.value;
    if (v.startsWith("-")) {
      parts.flags.add(v);
      if (GIT_VALUE_FLAGS.has(v)) {
        const value = argv[i + 1];
        if (v === "-C" && value && value.kind === "literal") {
          parts.cwdOverride = value.value;
        }
        i++; // skip the value token
      }
    } else {
      parts.positionals.push(v);
    }
  }
  return parts;
}

/** `git -C <path>` target, for external-cwd detection in classify.ts. */
export function extractGitCwdOverride(cmd: ParsedBashCommand): string | null {
  return splitGitArgv(cmd).cwdOverride ?? null;
}

export function classifyGitDetailed(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  const { positionals, flags } = splitGitArgv(cmd);

  const sub = positionals[0] ?? "";
  const sub2 = positionals[1] ?? "";
  if (!sub) return "write_potent";

  // Global flag escalation — flags that discard state.
  if (flags.has("--force") || flags.has("-f") || flags.has("--force-with-lease")) return "write_danger";
  if (flags.has("--hard") || flags.has("--discard-changes")) return "write_danger";

  switch (sub) {
    case "stash": {
      if (!sub2 || sub2 === "push" || sub2 === "save") return "write_reversible";
      if (sub2 === "list" || sub2 === "show") return "read";
      if (sub2 === "pop" || sub2 === "apply") return "write_reversible";
      if (sub2 === "drop" || sub2 === "clear") return "write_danger";
      return "write_reversible";
    }
    case "checkout": {
      if (flags.has("--")) return "write_danger";
      if (flags.has("-b") || flags.has("-B") || flags.has("--orphan")) return "write_reversible";
      const target = positionals[1];
      if (target) {
        if (target === "." || target === "./") return "write_danger";
        // A target that exists on disk is a pathspec restore (discards
        // uncommitted changes), not a branch switch. Branch/file
        // ambiguity resolves to the conservative side.
        try {
          if (existsSync(path.resolve(ctx.effectiveCwd, target))) return "write_danger";
        } catch { /* ignore */ }
      }
      return "write_reversible";
    }
    case "switch": {
      // --discard-changes / -f handled by the global escalation above.
      return "write_reversible";
    }
    case "restore": {
      const staged = flags.has("--staged") || flags.has("-S");
      const worktree = flags.has("--worktree") || flags.has("-W");
      if (staged && !worktree) return "write_reversible"; // unstage only
      return "write_danger"; // overwrites working tree by design
    }
    case "reset": {
      // --hard already caught by global flag check above
      return "write_reversible";
    }
    case "clean": {
      if (flags.has("-n") || flags.has("--dry-run")) return "read";
      return "write_danger";
    }
    case "branch": {
      if (flags.has("-D") || flags.has("-d") || flags.has("--delete")) return "write_danger";
      if (positionals.length <= 1) return "read";
      return "write_reversible";
    }
    case "tag": {
      if (flags.has("-d") || flags.has("--delete")) return "write_danger";
      if (positionals.length <= 1) return "read";
      return "write_reversible";
    }
    case "remote": {
      if (!sub2 || sub2 === "show" || sub2 === "get-url") return "read";
      if (sub2 === "add" || sub2 === "rename" || sub2 === "set-url") return "write_reversible";
      if (sub2 === "remove" || sub2 === "rm") return "write_danger";
      return "write_potent";
    }
    case "worktree": {
      if (!sub2 || sub2 === "list") return "read";
      if (sub2 === "add") return "write_reversible";
      if (sub2 === "remove" || sub2 === "prune") return "write_danger";
      return "write_potent";
    }
    case "config": {
      if (flags.has("--unset") || flags.has("--remove-section")) return "write_potent";
      // 1 positional after "config" (key) = read, 2+ (key value) = write
      if (positionals.length <= 2) return "read";
      return "write_potent";
    }
    case "reflog": {
      if (sub2 === "expire" || sub2 === "delete" || sub2 === "drop") return "write_danger";
      return "read";
    }
    case "hash-object": {
      return flags.has("-w") ? "write_potent" : "read";
    }
    case "fsck": {
      return flags.has("--lost-found") ? "write_potent" : "read";
    }
    default: break;
  }

  if (GIT_DANGER_SUBCOMMANDS.has(sub)) return "write_danger";
  if (GIT_REVERSIBLE_SUBCOMMANDS.has(sub)) return "write_reversible";
  if (GIT_SAFE_SUBCOMMANDS.has(sub)) return "read";

  return "write_potent";
}

// ------------------------------------------------------------------
// Canonical pattern construction (rule memoization subjects)
// ------------------------------------------------------------------

// Risk flags encoded into the pattern so approving the plain form never
// covers the destructive form ("git push" ≠ "git push --force").
const PATTERN_RISK_FLAGS = new Set([
  "-f", "--force", "--force-with-lease", "--hard",
  "-D", "--delete", "--discard-changes",
]);

const SUBCOMMAND_TOOLS = new Set([
  "git", "npm", "npx", "pnpm", "yarn", "docker", "kubectl",
  "cargo", "go", "pip", "brew", "apt", "apt-get",
]);

export function buildCanonicalPatternFromParsed(
  cmd: ParsedBashCommand,
  caps: OsCapabilities = osCapabilities,
): string {
  const name = normalizedCommandName(cmd.name, caps);
  let base = name;
  // Risk-flag scan must not read value tokens as flags: `git commit -m
  // "-f"` carries a MESSAGE of "-f", not a force flag. For git, the
  // value-aware splitter provides the real flag set; other tools have
  // no value-flag table, so the raw scan stands.
  let riskSource: Iterable<string>;

  if (SUBCOMMAND_TOOLS.has(name)) {
    if (name === "git") {
      const parts = splitGitArgv(cmd);
      if (parts.positionals[0]) base = `${name} ${parts.positionals[0]}`;
      riskSource = parts.flags;
    } else {
      const first = cmd.argv.find((t) => t.kind === "literal" && !t.value.startsWith("-"))?.value;
      if (first) base = `${name} ${first}`;
      riskSource = cmd.argv.filter((t) => t.kind === "literal").map((t) => t.value);
    }
  } else {
    riskSource = cmd.argv.filter((t) => t.kind === "literal").map((t) => t.value);
  }

  const risks = new Set<string>();
  for (const v of riskSource) {
    if (PATTERN_RISK_FLAGS.has(v)) risks.add(v);
  }
  if (risks.size === 0) return base;
  return `${base} ${[...risks].sort().join(" ")}`;
}

/** Bare broad danger commands get session-only persistence offers. */
export function isBroadDangerPattern(pattern: string): boolean {
  return !pattern.includes(" ") && BASH_DANGER_COMMANDS.has(pattern);
}

// ------------------------------------------------------------------
// PowerShell tables
// ------------------------------------------------------------------

const PS_SAFE_COMMANDS = new Set([
  "get-childitem", "get-content", "get-item", "get-itemproperty",
  "test-path", "resolve-path", "split-path", "join-path",
  "get-location", "get-psdrive",
  "select-string", "select-object", "sort-object", "group-object",
  "where-object", "foreach-object", "measure-object",
  "format-table", "format-list", "format-wide", "format-custom",
  "out-string", "out-null", "out-host",
  "write-output", "write-host", "write-verbose", "write-debug", "write-warning",
  "get-process", "get-service",
  "get-date", "get-random", "get-filehash",
  "get-command", "get-help", "get-alias", "get-module",
  "get-variable", "get-host", "get-culture",
  "compare-object", "measure-command",
  "convertto-json", "convertfrom-json",
  "convertto-csv", "convertfrom-csv",
  "get-acl", "get-executionpolicy",
  // Interactive niceties — no side effects beyond the terminal itself.
  "clear-host", "start-sleep",
]);

// Only filesystem-only operations are reversible. cmdlets that can
// target non-filesystem providers (registry, env, etc.) are potent.
const PS_REVERSIBLE_COMMANDS = new Set([
  "add-content",
]);

// Set-Location/Push-Location are potent (not reversible) because
// the cd-context tracker only understands bash `cd` — PowerShell
// directory changes would bypass external-cwd detection and let
// subsequent reads from outside projectRoot auto-allow silently.
// classify.ts additionally disables memoization and safe-segment
// stripping for any command list containing one of these.
export const PS_CWD_COMMANDS = new Set([
  "set-location", "push-location", "pop-location",
]);

const PS_DANGER_COMMANDS = new Set([
  "remove-item", "clear-content", "clear-item",
  "stop-process", "stop-service", "restart-service",
  "remove-itemproperty",
  "clear-recyclebin",
  "restart-computer", "stop-computer",
  "set-executionpolicy",
]);

const PS_POTENT_COMMANDS = new Set([
  "new-item", "copy-item", "move-item", "rename-item",
  "new-itemproperty", "set-itemproperty",
  "set-content", "out-file",
  "invoke-webrequest", "invoke-restmethod",
  "start-process", "start-job", "start-service",
  "invoke-command",
  "new-object",
  "install-module", "import-module", "save-module",
  "install-package",
  "expand-archive", "compress-archive",
  "register-scheduledjob", "register-scheduledtask",
  "set-acl",
]);

/** Dangerous PowerShell patterns: eval-equivalents and code injection vectors. */
const PS_EVAL_COMMANDS = new Set([
  "invoke-expression", "iex",
]);

// PowerShell disk-management cmdlets that irreversibly destroy data —
// escalate to catastrophic (the only class yolo still prompts on),
// mirroring the POSIX mkfs/fdisk/dd handling in classifyBashCommand.
const PS_CATASTROPHIC_COMMANDS = new Set([
  "format-volume", "clear-disk", "initialize-disk", "remove-partition",
]);

/** PowerShell common aliases → canonical cmdlet name (lowercase). */
const PS_ALIASES = new Map<string, string>([
  // Navigation
  ["cd", "set-location"], ["chdir", "set-location"],
  ["pushd", "push-location"], ["popd", "pop-location"],
  // Files
  ["ls", "get-childitem"], ["dir", "get-childitem"], ["gci", "get-childitem"],
  ["cat", "get-content"], ["type", "get-content"], ["gc", "get-content"],
  ["cp", "copy-item"], ["copy", "copy-item"], ["ci", "copy-item"],
  ["mv", "move-item"], ["move", "move-item"], ["mi", "move-item"],
  ["rm", "remove-item"], ["del", "remove-item"], ["rd", "remove-item"],
  ["rmdir", "remove-item"], ["erase", "remove-item"], ["ri", "remove-item"],
  ["ren", "rename-item"], ["rni", "rename-item"],
  ["ni", "new-item"], ["md", "new-item"], ["mkdir", "new-item"],
  // Output
  ["echo", "write-output"], ["write", "write-output"],
  // Search
  ["sls", "select-string"],
  // Process
  ["ps", "get-process"], ["gps", "get-process"],
  ["kill", "stop-process"], ["spps", "stop-process"],
  // Filtering / iteration (these execute script blocks!)
  ["where", "where-object"], ["?", "where-object"],
  ["foreach", "foreach-object"], ["%", "foreach-object"],
  // Misc
  ["cls", "clear-host"], ["clear", "clear-host"],
  ["iex", "invoke-expression"],
  ["iwr", "invoke-webrequest"],
  ["irm", "invoke-restmethod"],
  ["icm", "invoke-command"],
  ["sal", "set-alias"],
  ["sv", "set-variable"],
  ["sleep", "start-sleep"],
  // NOTE: no `sc` entry. Windows PowerShell 5.1 aliases sc→Set-Content,
  // but on every PowerShell `sc` can also resolve to sc.exe (the service
  // controller, danger tier). classifyPSCommand special-cases the raw
  // name to the conservative side instead of downgrading via the alias.
  ["ac", "add-content"],
  ["ii", "invoke-item"],
  ["start", "start-process"], ["saps", "start-process"],
]);

/**
 * Resolve a PowerShell command name to its canonical cmdlet (lowercase).
 * Handles aliases, Module\Cmdlet prefix stripping, and implicit
 * executable extensions (`rm.exe`).
 */
export function resolvePSCommandName(rawName: string, caps: OsCapabilities = osCapabilities): string {
  let name = rawName.toLowerCase();
  // Strip surrounding quotes: & "Remove-Item" or & 'rm'
  if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
    name = name.slice(1, -1);
  }
  // Strip module prefix: Microsoft.PowerShell.Management\Get-ChildItem → get-childitem
  const backslash = name.lastIndexOf("\\");
  if (backslash >= 0) name = name.slice(backslash + 1);
  for (const ext of caps.strippableExecutableExtensions) {
    if (name.endsWith(ext) && name.length > ext.length) {
      name = name.slice(0, name.length - ext.length);
      break;
    }
  }
  // Resolve alias
  return PS_ALIASES.get(name) ?? name;
}

// PowerShell accepts unambiguous parameter prefixes: -e, -en, -enc, ...
// all resolve to -EncodedCommand. Minimum 2 chars after dash.
function isEncodedCommandFlag(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.startsWith("-e") && "-encodedcommand".startsWith(lower);
}

/** Check if `value` is a valid PowerShell prefix of `fullParam` (e.g. "-rec" matches "-recurse"). */
function isPSParamPrefix(value: string, fullParam: string): boolean {
  const lower = value.toLowerCase();
  return lower.length >= 2 && lower.startsWith("-") && fullParam.startsWith(lower);
}

/** Check if any argv token contains executable PowerShell code:
 *  script blocks `{ ... }`, subexpressions `$(...)`, or grouped
 *  command expressions `(...)`. */
function hasExecutableExpression(cmd: ParsedBashCommand): boolean {
  return cmd.argv.some(
    (t) => t.kind === "unresolved_expression" &&
      (t.text.includes("{") || t.text.includes("$(") || t.text.startsWith("(")),
  );
}

export function classifyPSCommand(cmd: ParsedBashCommand, ctx: ClassifyCtx): PermissionClass {
  const caps = ctx.caps;
  const rawLower = cmd.name.toLowerCase().replace(/^["']|["']$/g, "");

  // `sc` is ambiguous: Set-Content alias on Windows PowerShell 5.1, the
  // service-controller sc.exe everywhere else. Take the dangerous read.
  if (rawLower === "sc" || rawLower === "sc.exe") return "write_danger";

  const name = resolvePSCommandName(cmd.name, caps);

  // Eval-equivalent commands are always dangerous.
  if (PS_EVAL_COMMANDS.has(name)) return "write_danger";

  // Dangerous flags: -EncodedCommand on pwsh/powershell re-invocation.
  // PowerShell accepts unambiguous parameter prefixes, so -enc, -en, -e
  // all resolve to -EncodedCommand.
  if (name === "pwsh" || name === "powershell") {
    const hasEncoded = cmd.argv.some(
      (t) => t.kind === "literal" && isEncodedCommandFlag(t.value),
    );
    if (hasEncoded) return "write_danger";
    return "write_potent";
  }

  // Native executables that pass through (git, npm, etc.) use the
  // same bash classification since they're not PowerShell-specific.
  if (name === "git") return classifyGitDetailed(cmd, ctx);

  // Catastrophic: Remove-Item -Recurse -Force targeting root/home/drive.
  if (name === "remove-item") {
    const hasRecurse = cmd.argv.some(
      (t) => t.kind === "literal" && isPSParamPrefix(t.value, "-recurse"),
    );
    const hasForce = cmd.argv.some(
      (t) => t.kind === "literal" && isPSParamPrefix(t.value, "-force"),
    );
    if (hasRecurse && hasForce) {
      const targetsDangerousPath = cmd.argv.some((t) => {
        if (t.value.startsWith("-")) return false;
        // Normalize: strip trailing slashes, backslashes, wildcards, and dots.
        // This catches C:\, C:\*, C:\., ~\*, etc.
        const v = t.value.replace(/[\\/]+$/, "").replace(/[\\/][.*]+$/, "").replace(/[\\/]+$/, "");
        // Drive roots: C:, C:\, /
        if (/^[a-z]:?$/i.test(v) || v === "/" || v === "\\") return true;
        // Home references
        if (v === "~" || v === "$HOME" || /^\$env:USERPROFILE$/i.test(v) || /^\$env:HOME$/i.test(v)) return true;
        // System paths
        if (/^\$env:(SYSTEMROOT|WINDIR|PROGRAMFILES)$/i.test(v)) return true;
        return false;
      });
      if (targetsDangerousPath) return "catastrophic";
    }
    return "write_danger";
  }

  // Catastrophic: PowerShell disk-wipe cmdlets, plus the Windows
  // format/diskpart exes when invoked from PowerShell (empty set off
  // Windows). Checked before the danger set so they escalate fully.
  if (PS_CATASTROPHIC_COMMANDS.has(name)) return "catastrophic";
  if (caps.platformSpecificCatastrophicCommands.has(name)) return "catastrophic";

  // Check PowerShell-specific command sets.
  if (PS_DANGER_COMMANDS.has(name)) return "write_danger";

  // Add-Type is runtime .NET compilation — potent.
  if (name === "add-type") return "write_potent";

  // invoke-item / ii is ShellExecute — can run arbitrary executables.
  if (name === "invoke-item") return "write_danger";

  if (PS_CWD_COMMANDS.has(name)) return "write_potent";
  if (PS_POTENT_COMMANDS.has(name)) return "write_potent";
  if (PS_REVERSIBLE_COMMANDS.has(name)) return "write_reversible";

  // Safe commands — but if they receive a script block argument, that
  // block can contain arbitrary code (e.g. ForEach-Object { rm foo }).
  // Script blocks and subexpressions can't be inspected statically, so
  // escalate to write_danger, which prompts in read_only/reversible
  // modes. (yolo only force-prompts `catastrophic`; classifying every
  // script-block-bearing cmdlet as catastrophic would be far too
  // aggressive.)
  if (PS_SAFE_COMMANDS.has(name)) {
    return hasExecutableExpression(cmd) ? "write_danger" : "read";
  }

  // Native executables that also appear in the bash sets.
  if (isDangerCommand(name, caps)) return "write_danger";
  const bashSafe = BASH_SAFE_COMMANDS.get(name);
  if (bashSafe) return bashSafe === "read" ? "read" : bashSafe(cmd, ctx);
  if (BASH_POTENT_COMMANDS.has(name)) return "write_potent";

  // Unknown commands default to potent (fail-safe).
  return "write_potent";
}

/** True when the parsed PS command is (or aliases to) a cwd-changing cmdlet. */
export function isPSCwdCommand(cmd: ParsedBashCommand, caps: OsCapabilities = osCapabilities): boolean {
  return PS_CWD_COMMANDS.has(resolvePSCommandName(cmd.name, caps));
}
