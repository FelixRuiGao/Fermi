/**
 * Binary/PATH resolution for spawned child processes.
 *
 * A macOS GUI app (and, it turns out, electron-vite's Electron child) does NOT
 * inherit the login shell's PATH, so `spawn('bun')` / `execFile('git')` /
 * `execFile('rg')` fail with ENOENT even though the tools are installed. We fix
 * this two ways: resolve `bun` to an absolute path, and prepend the common
 * install dirs onto PATH for every child process.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

function commonBinDirs(): string[] {
  const dirs: string[] = []
  if (process.env.BUN_INSTALL) dirs.push(path.join(process.env.BUN_INSTALL, 'bin'))
  if (process.env.HOME) dirs.push(path.join(process.env.HOME, '.bun', 'bin'))
  dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin')
  return dirs
}

/** PATH with the common install dirs prepended (deduped, preserving order). */
export function augmentedPath(base: string = process.env.PATH ?? ''): string {
  const existing = base.split(path.delimiter).filter(Boolean)
  const set = new Set(existing)
  const prepend = commonBinDirs().filter((d) => !set.has(d))
  return [...prepend, ...existing].join(path.delimiter)
}

/** Absolute path to `bun` from the well-known install locations, or null. */
export function resolveBun(): string | null {
  const candidates = [
    process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin', 'bun') : null,
    process.env.HOME ? path.join(process.env.HOME, '.bun', 'bin', 'bun') : null,
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ].filter((c): c is string => c !== null)
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/** Prepend the common bin dirs onto the current process PATH (idempotent). */
export function ensurePathEnv(): void {
  process.env.PATH = augmentedPath()
}
