/**
 * Windows shell provider — stub.
 *
 * Real Windows support requires:
 *   - Choosing between cmd.exe and PowerShell (LLM expects bash; we
 *     could wrap with WSL or git-bash, but those aren't always
 *     installed)
 *   - taskkill /T /F for process-tree termination
 *   - Distinct env allowlist (SYSTEMROOT, COMSPEC, USERPROFILE,
 *     APPDATA, LOCALAPPDATA, TEMP, TMP, PATHEXT, ...)
 *
 * Out of scope for the cross-platform migration that introduced this
 * file. Every method throws a clearly labelled error so Windows users
 * see an actionable message rather than a silent fall-through.
 */

import type { ChildProcess } from "node:child_process";
import type { ShellProvider, ShellSpawnRequest } from "../types.js";

function notImplemented(method: string): never {
  throw new Error(
    `PlatformNotImplemented: shell.${method} on win32 — TODO. ` +
      `See Docs/decisions.md (D3) for the Windows stub policy.`,
  );
}

export const win32Shell: ShellProvider = {
  path: "cmd.exe",
  spawn(_request: ShellSpawnRequest): ChildProcess {
    return notImplemented("spawn");
  },
  killTree(_child: ChildProcess, _signal: NodeJS.Signals): void {
    return notImplemented("killTree");
  },
  buildChildEnv(): NodeJS.ProcessEnv {
    return notImplemented("buildChildEnv");
  },
};
