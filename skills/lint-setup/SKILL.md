---
name: lint-setup
description: Set up or fix linter + formatter configuration for the project (ESLint/Prettier, Ruff/Black, golangci-lint, clippy, etc.) with sensible rules and editor/CI integration. Use when adding or repairing linting/formatting.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; linter/formatter ecosystem knowledge (no text reused)
---

# Lint / Format Setup

Consistent, automated style with zero bikeshedding. Formatter owns layout;
linter owns correctness — don't make them fight.

## 1. Detect stack and existing config

Languages, package manager, and any current lint/format config (don't add a
second tool that conflicts). `$ARGUMENTS` may specify. Pick the ecosystem
standard:

- JS/TS: ESLint (correctness) + Prettier (format) — disable ESLint stylistic
  rules that Prettier owns (`eslint-config-prettier`). Or Biome (does both,
  fast).
- Python: Ruff (lint + format, replaces flake8/isort/black for most) or
  Black + Ruff.
- Go: `gofmt`/`goimports` + `golangci-lint`. Rust: `rustfmt` + `clippy`.

## 2. Configure pragmatically

- Start from the recommended/idiomatic preset; add rules deliberately, don't
  hand-roll hundreds.
- **Formatter and linter must not disagree** about the same thing.
- Severity that matches reality: errors for real bugs, warnings for smells;
  don't turn the whole codebase red on day one — see migration below.
- Sensible ignores (generated code, vendored, build output) — but don't ignore
  real source to dodge fixing it.
- Pin tool versions so everyone + CI get identical results.

## 3. Migrate an existing codebase sanely

Run the formatter once as a single isolated commit (so it doesn't pollute future
diffs/blame — consider a `.git-blame-ignore-revs`). For lint, enable
incrementally or baseline existing violations rather than blocking all work.

## 4. Integrate and verify

Add `lint`/`format`/`format:check` scripts; wire into CI (see `ci-setup`) and
optionally a fast pre-commit hook (see `pre-commit`); editor config
(`.editorconfig`, format-on-save settings) so it's frictionless. Verify: run
them, confirm format is idempotent and the linter flags a deliberately bad
sample and passes clean code. Report the tools, key rules, and how to run them.
