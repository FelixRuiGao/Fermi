---
name: refactor
description: Restructure code to improve clarity or design while strictly preserving behavior, verified by tests. Use when asked to refactor, clean up, extract, rename, or decouple code.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; classic refactoring discipline (no text reused)
---

# Refactor

Behavior in, behavior out. A refactor that changes observable behavior is a bug.

## 1. Establish a safety net

Before touching anything, find the tests that cover the target and run them
green. If there is **no** coverage for the code you're about to restructure,
add characterization tests first (capture current behavior, even quirks) — or
tell the user the refactor is unsafe without them and get agreement.

`$ARGUMENTS` is the target (file/function/smell). Read it and its callers fully.

## 2. Identify the actual problem

Name the specific smell driving the change: duplication, long function, deep
nesting, primitive obsession, feature envy, leaky abstraction, tight coupling,
unclear naming. Refactor toward removing *that* — don't restyle code just to
restyle it.

## 3. Small, reversible steps

Apply one transformation at a time, re-running tests after each:

- Rename for intent · extract function/variable/constant · inline the needless
  · replace conditional with polymorphism/lookup · introduce a parameter object
  · separate command from query · push logic behind a clear boundary.

Keep each step mechanical and verifiable. Commit (or checkpoint) between
logically distinct steps so any single step is easy to revert.

## 4. Constraints

- **Do not** change public APIs, signatures, or serialized formats unless the
  task explicitly is that — and if so, flag it as breaking.
- Don't mix a refactor with a behavior change or bug fix in the same diff; if
  you find a bug, surface it separately.
- Don't add speculative abstraction for hypothetical futures. Reduce complexity;
  don't relocate it.

## 5. Verify

Full relevant test suite green, plus linters/typecheck. Show the before/after
shape and state explicitly what behavior is unchanged and how you confirmed it.
