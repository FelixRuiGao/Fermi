/**
 * Hook management helpers shared by the TUI /hooks command and the
 * server-mode control RPCs. Enable/disable state lives in each hook's
 * on-disk hook.json (`disabled: true`).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveAssetPaths } from "../config.js";
import { loadHooksFromDir } from "./loader.js";
import type { HookManifest } from "./types.js";

export type DiskHook = HookManifest;

/**
 * Load ALL hooks from disk, including disabled ones and shadowed duplicates
 * (loadHooksMulti de-dupes by name; management UIs want everything).
 */
export function loadAllHooksFromDisk(): DiskHook[] {
  try {
    const paths = resolveAssetPaths();
    const allHooks: DiskHook[] = [];
    for (const { dir, scope } of paths.hookRoots) {
      for (const h of loadHooksFromDir(dir, scope as "project" | "global")) {
        allHooks.push(h as DiskHook);
      }
    }
    return allHooks;
  } catch {
    return [];
  }
}

/** Flip a hook's disabled flag in its source hook.json. */
export function setHookDisabled(sourcePath: string, disabled: boolean): boolean {
  if (!existsSync(sourcePath)) return false;
  try {
    const raw = JSON.parse(readFileSync(sourcePath, "utf-8"));
    if (disabled) {
      raw["disabled"] = true;
    } else {
      delete raw["disabled"];
    }
    writeFileSync(sourcePath, JSON.stringify(raw, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** Reload hooks from disk into a session's HookRuntime. Returns active count, -1 on failure. */
export function reloadHooksIntoRuntime(session: {
  hookRuntime?: { setHooks(hooks: HookManifest[]): void } | null;
}): number {
  try {
    const { loadHooksMulti } = require("./index.js") as typeof import("./index.js");
    const paths = resolveAssetPaths();
    const hooks = loadHooksMulti(paths.hookRoots);
    session.hookRuntime?.setHooks(hooks);
    return hooks.length;
  } catch {
    return -1;
  }
}
