---
name: simplify
description: Review recently changed code for over-engineering, needless abstraction, and duplication, then make it simpler without changing behavior. Use after writing a feature, or when code feels heavier than the problem.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; YAGNI/KISS discipline (no text reused)
---

# Simplify

Match the solution to the size of the problem. Less code, same behavior.

## 1. Scope

Default to the current change: `git diff` + `git diff --staged` (or
`git diff <base>...HEAD`). `$ARGUMENTS` may target a specific path. Read it in
context — simplicity is judged against how the code is actually used.

## 2. Look for

- **Premature abstraction** — an interface/factory/generic with one
  implementation; a config option nothing sets; a hook with one caller.
- **Speculative generality** — parameters, branches, or extension points for
  futures that don't exist.
- **Duplication** — the same logic 2–3 places that should be one (but three
  similar lines beat a forced wrong abstraction — don't over-correct).
- **Indirection** — wrappers/helpers that only forward; layers that add a name
  but no behavior.
- **Dead/defensive code** — unreachable branches, validation for impossible
  inputs, fallbacks for states that can't occur, backward-compat shims for code
  with one caller.
- **Verbose control flow** — nested conditionals collapsible with early returns;
  manual loops replaceable by a clear standard-library call.

## 3. Apply, safely

Make the simplification with tests covering the area; run them after each step
(see the `refactor` discipline for the safety-net method). Behavior must not
change. Deleting code is a valid and often the best simplification.

## 4. Judgment

Stop when further "simplification" would hurt readability or correctness.
Simpler ≠ clever one-liners. Report what you removed/collapsed, the net line
delta, and confirm behavior is unchanged.
