import type { ConversationEntry } from '@shared/rpc.js'

function shallowEqualRecord(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function sameEntry(a: ConversationEntry, b: ConversationEntry): boolean {
  return (
    a.kind === b.kind &&
    a.text === b.text &&
    a.startedAt === b.startedAt &&
    a.elapsedMs === b.elapsedMs &&
    a.id === b.id &&
    a.queued === b.queued &&
    a.dim === b.dim &&
    a.fullText === b.fullText &&
    shallowEqualRecord(a.meta, b.meta)
  )
}

function entryKey(entry: ConversationEntry, index: number): string {
  return entry.id ?? `anon:${index}:${entry.kind}`
}

/**
 * Reconcile a new projected entry array against the previous one, preserving
 * object identity for unchanged entries. React components keyed on these
 * entries can skip re-rendering when the reference is unchanged.
 */
export function reconcileEntries(
  previous: readonly ConversationEntry[],
  next: readonly ConversationEntry[],
): ConversationEntry[] {
  const prevById = new Map<string, ConversationEntry>()
  for (let i = 0; i < previous.length; i++) {
    prevById.set(entryKey(previous[i]!, i), previous[i]!)
  }
  return next.map((entry, i) => {
    const key = entryKey(entry, i)
    const existing = prevById.get(key)
    if (existing && sameEntry(existing, entry)) return existing
    return entry
  })
}
