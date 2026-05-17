---
name: coverage-gap
description: Find untested or under-tested code paths and add the missing tests. Use when asked to improve test coverage or find what isn't tested.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Coverage Gap

Raise *meaningful* coverage — close real risk, don't chase a percentage.

## 1. Measure

Run the project's coverage tool to get a real report, not a guess:

- JS/TS: `vitest run --coverage` / `jest --coverage` / `nyc`
- Python: `pytest --cov=<pkg> --cov-report=term-missing`
- Go: `go test ./... -coverprofile=cover.out && go tool cover -func=cover.out`
- Rust: `cargo llvm-cov`

Scope to `$ARGUMENTS` (a path/module) if given, else the changed files
(`git diff --stat <base>...HEAD`) — newly added code is the highest-value target.

## 2. Prioritize the gaps

Not all uncovered lines matter equally. Rank by risk:

1. Core logic, money/auth/security, data mutation.
2. Error/exception branches and edge-case conditionals (commonly 0% covered).
3. Public API surface.
4. Deprioritize: trivial getters, generated code, pure config, `__repr__`.

## 3. Close them

For each high-value gap, add tests using the project's framework and the
discipline in the `test-gen` approach: exercise the specific uncovered branch,
assert behavior, keep them deterministic. Prefer a few sharp tests over many
shallow ones.

## 4. Verify

Re-run coverage; confirm the targeted lines/branches are now hit and the suite
is green. Report before/after for the targeted area and list any remaining gaps
you intentionally left (with the reason).
