---
name: pre-commit
description: Set up or fix git pre-commit hooks that run formatters, linters, and fast checks before a commit, using the project's stack. Use when adding commit-time quality gates or debugging hook failures.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey (no text reused)
---

# Pre-commit Hooks

Catch trivial issues before they reach CI — but keep the hook fast or developers
will bypass it.

## 1. Pick the framework that fits the stack

- Polyglot / Python: the `pre-commit` framework (`.pre-commit-config.yaml`).
- JS/TS: `husky` + `lint-staged` (run only on staged files), or `lefthook`
  (fast, polyglot).
- Match what the repo already uses; don't add a second hook manager.
`$ARGUMENTS` may specify.

## 2. Configure the right checks

Run **only fast, deterministic** checks on **staged files only**:

- Auto-format (prettier/black/ruff format/gofmt) and re-stage the result.
- Lint (eslint/ruff/golangci-lint) on changed files.
- Cheap safety: trailing whitespace/EOF, large-file guard, merge-conflict
  markers, a secrets check (gitleaks) — see `secrets-scan`.
- **Not** the full test suite or typecheck of the whole repo (too slow → people
  `--no-verify`). Heavy checks belong in CI; the hook is a fast first filter.

## 3. Install and make it reproducible

Wire installation into the repo so it's automatic for everyone
(`prepare`/`postinstall` script, `pre-commit install`, `lefthook install`),
documented in the README/CONTRIBUTING. Pin tool versions so the hook behaves the
same for everyone and matches CI.

## 4. Verify

- Trigger it on a deliberately bad staged change → it must block.
- Trigger on clean code → it must pass quickly (aim for a couple seconds).
- Confirm auto-fixes get re-staged so the commit includes them.

Report what runs, expected runtime, and how a developer legitimately bypasses it
in a true emergency (and that CI still enforces the rest). Don't make the hook
so heavy it gets disabled — that defeats the purpose.
