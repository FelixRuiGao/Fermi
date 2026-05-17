---
name: concurrency-review
description: Audit concurrent/async/parallel code for races, deadlocks, atomicity violations, and unsafe shared state. Use when reviewing threaded, async, or parallel code, or when a bug only appears under load.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; concurrency-correctness principles (no text reused)
---

# Concurrency Review

Concurrency bugs are non-deterministic and rarely caught by normal tests. Reason
about them from the code, not from a green test run.

## 1. Identify the concurrency model

Threads + shared memory? async/await event loop (single-threaded but
interleaved)? multi-process? worker pool? actor/channel? The failure modes
differ. `$ARGUMENTS` scopes the code; read it with the data it shares.

## 2. Look for

- **Data races**: shared mutable state read/written by ≥2 tasks without
  synchronization (or "I'll just use a plain field" across threads). Includes
  lazy init / double-checked locking done wrong.
- **Check-then-act / read-modify-write** not atomic: `if not exists: create`,
  `count += 1`, get-then-put on a map, balance checks — TOCTOU. Needs a lock,
  atomic, or transaction.
- **Deadlock / livelock**: locks acquired in inconsistent order, holding a lock
  across an `await`/blocking call/callback, nested locks, sync-over-async.
- **`await` gaps**: state assumed stable across an `await` that another task can
  mutate; not awaiting a promise (lost work/unhandled rejection — see
  `silent-failure`).
- **Visibility/ordering**: missing memory barrier/`volatile`/atomic; assuming
  ordering without happens-before.
- **Cancellation/shutdown**: tasks not cancelled, resources not drained, partial
  work left committed.
- **Pools/limits**: connection/thread pool exhaustion, unbounded concurrency,
  backpressure missing.
- **Idempotency**: retried operations that double-apply.

## 3. Report

Per finding: `file:line`, the exact interleaving that breaks it (state A, task 1
does X, task 2 does Y, → wrong outcome), the consequence, and the fix (narrow
the critical section, use an atomic/immutable structure, fix lock order, make it
idempotent). Prefer eliminating shared mutability over adding more locks. State
confidence; concurrency reasoning is subtle — flag what needs a stress/race test
(`go test -race`, TSan, load test) to confirm.
