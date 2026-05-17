---
name: error-handling
description: Review and improve how code handles errors — propagation, context, recovery, user-facing messages, and resource cleanup. Use when error handling is missing, inconsistent, or hiding failures.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; robust error-handling principles (no text reused)
---

# Error Handling

Errors should be impossible to ignore, carry enough context to diagnose, and
leave the system in a known state.

## 1. Map the failure surface

For the scope (`$ARGUMENTS` or the current diff), find every operation that can
fail: I/O, network, parsing, external calls, concurrency, arithmetic, lookups.
For each, ask: detected? handled or propagated? does the program stay correct?

## 2. Principles to apply

- **Fail loud, not silent**: never swallow (empty catch, ignored error return,
  masking fallback). Pair with the `silent-failure` skill for the audit.
- **Handle or propagate — decide deliberately**: handle only where you can
  actually recover or add value; otherwise propagate. Don't catch-log-rethrow at
  every layer (log once, at the boundary).
- **Preserve context**: wrap with cause/stack intact (`raise ... from e`,
  `Error(..., { cause })`, `%w`); add what you were doing and the key inputs —
  not just "operation failed".
- **Right granularity**: catch specific error types, not a blanket
  `Exception`/`catch (e)` that hides bugs. Narrow try blocks.
- **Cleanup is guaranteed**: `finally`/`defer`/context-manager/RAII for files,
  locks, connections, transactions — released on every path including error.
- **Boundary translation**: convert internal errors into a typed result / clear
  user-facing message at the edge; never leak stack traces or internals to end
  users; do log them internally.
- **Distinguish** programmer bugs (let them crash loudly in dev) from expected
  operational errors (handle gracefully) — don't blanket-catch the former.

## 3. Apply and verify

Make the changes minimal and consistent with the codebase's existing strategy
(don't introduce a third error pattern). Add/adjust tests for the error paths —
assert the failure is observable and the state is clean. Report each change as
`file:line — problem → fix` and any place a failure mode is still unhandled.
