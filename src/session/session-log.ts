/**
 * SessionLog — the structured log store (P2.2).
 *
 * Owns the append-only LogEntry array plus its change-detection revision,
 * change listeners, and entry-id allocation. Session exposes thin accessors
 * so the rest of the runtime keeps reading/writing `_log` unchanged.
 */

import { LogIdAllocator, type LogEntry, type TurnKind } from "../log-entry.js";

/** Stamp providerRoundId for provider-round entry types (idempotent). */
export function stampProviderRoundId(entry: LogEntry): void {
  if (
    entry.roundIndex !== undefined &&
    (
      entry.type === "assistant_text" ||
      entry.type === "reasoning" ||
      entry.type === "tool_call" ||
      entry.type === "tool_result" ||
      entry.type === "no_reply"
    )
  ) {
    entry.meta["providerRoundId"] ??= `input-${entry.turnIndex}:round-${entry.roundIndex}`;
  }
}

export interface TurnListing {
  turnIndex: number;
  entryIndex: number;
  turnKind: TurnKind;
  preview: string;
  timestamp: number;
  /** Whether this turn is inside the active window (after last compact_marker). */
  inActiveWindow: boolean;
}

export class SessionLog {
  private _entries: LogEntry[] = [];
  private _revision = 0;
  private _listeners = new Set<() => void>();
  private _idAllocator = new LogIdAllocator();

  /** Live entry array. Callers may mutate entries in place (then touch()). */
  get entries(): LogEntry[] {
    return this._entries;
  }

  /** Swap in a different backing array (init, restore). */
  replace(entries: LogEntry[]): void {
    this._entries = entries;
  }

  get revision(): number {
    return this._revision;
  }

  bumpRevision(): void {
    this._revision += 1;
  }

  /**
   * Reset only valid on a fresh/shadow store: the live session's revision
   * must stay monotonic so UI subscribers always detect swaps.
   */
  resetRevision(): void {
    this._revision = 0;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  notifyListeners(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }

  /** Bump revision and notify — call after any in-place entry mutation. */
  touch(): void {
    this.bumpRevision();
    this.notifyListeners();
  }

  get idAllocator(): LogIdAllocator {
    return this._idAllocator;
  }

  set idAllocator(alloc: LogIdAllocator) {
    this._idAllocator = alloc;
  }

  nextId(type: LogEntry["type"]): string {
    return this._idAllocator.next(type);
  }

  /** Append an entry, stamping providerRoundId for provider-round types. */
  append(entry: LogEntry): void {
    stampProviderRoundId(entry);
    this._entries.push(entry);
    this.touch();
  }

  /** Index of the first entry after the last live compact_marker. */
  activeWindowStartIdx(): number {
    for (let i = this._entries.length - 1; i >= 0; i--) {
      if (this._entries[i].type === "compact_marker" && !this._entries[i].discarded) {
        return i + 1;
      }
    }
    return 0;
  }

  /**
   * Return metadata for every turn in the log.
   * Each entry includes turnKind (from turn_start meta) and a preview.
   * Callers filter by turnKind, active window, etc.
   */
  listTurns(): TurnListing[] {
    let lastCompactMarkerIdx = -1;
    for (let i = this._entries.length - 1; i >= 0; i--) {
      if (this._entries[i].type === "compact_marker" && !this._entries[i].discarded) {
        lastCompactMarkerIdx = i;
        break;
      }
    }

    const turns: TurnListing[] = [];

    for (let i = 0; i < this._entries.length; i++) {
      const entry = this._entries[i];
      if (entry.discarded) continue;
      if (entry.type !== "input_received" && entry.type !== "turn_start") continue;

      const meta = entry.meta as Record<string, unknown>;
      const turnKind = entry.type === "input_received"
        ? ((meta.inputKind as TurnKind) ?? "user")
        : ((meta.turnKind as TurnKind) ?? "user");
      if (turnKind !== "user" && turnKind !== "summarize" && turnKind !== "compact") continue;

      const preview = entry.type === "input_received"
        ? (entry.display || "").replace(/\s+/g, " ").trim().slice(0, 240)
        : "";

      turns.push({
        turnIndex: entry.turnIndex,
        entryIndex: i,
        turnKind,
        preview: preview || `(turn ${entry.turnIndex})`,
        timestamp: entry.timestamp,
        inActiveWindow: i > lastCompactMarkerIdx,
      });
    }

    return turns;
  }
}
