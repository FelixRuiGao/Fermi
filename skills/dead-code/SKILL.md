---
name: dead-code
description: Find and safely remove unused code across the codebase — unreferenced functions, exports, files, deps, and unreachable branches — without breaking dynamic usage. Use when cleaning up cruft or reducing surface area.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; safe dead-code-elimination practice (no text reused)
---

# Dead Code Removal

Deleting code is high-value but risky — the danger is "unused" code that's
actually used dynamically. Be evidence-driven.

## 1. Detect with real tools, not just grep

- JS/TS: `knip` / `ts-prune` / `eslint no-unused-vars` / bundler analysis.
- Python: `vulture`, coverage of the test+app run.
- Go: `deadcode`, `staticcheck`. Rust: `cargo +nightly udeps`, `#[warn(dead_
  code)]`. Plus unused dependencies via the dep tooling (`depcheck`, etc.).

`$ARGUMENTS` may scope it. Tools give candidates, not verdicts.

## 2. Confirm each candidate is *truly* unused

A symbol can look unreferenced but be reached via:

- Reflection / dynamic dispatch / string-keyed lookup / DI containers.
- Public API consumed **outside this repo** (a library's exports — removing
  these is a breaking change, not cleanup).
- Framework conventions (route files, lifecycle hooks, serializers, plugins
  auto-discovered by name/path).
- Build/CI/scripts, config-referenced, test-only utilities, feature-flagged
  paths.
- Re-exports / barrel files; conditional compilation.

For each candidate, grep the whole repo (and consider consumers) and reason
about dynamic use before deleting. When unsure, leave it and flag it — a wrong
deletion is worse than a little cruft.

## 3. Remove in small, reversible steps

Delete cohesively (the symbol *and* its now-orphaned helpers, tests, types,
docs). One logical removal per commit so any single delete is easy to revert.
For a library's public surface, deprecate rather than delete unless told it's a
breaking release.

## 4. Verify hard

After each removal: typecheck, lint, **full** test suite, and a build — dead-
code bugs surface at build/runtime, not in the editor. For dynamically-loaded
code, also exercise the relevant runtime path. Report what was removed, the
evidence it was unused, the line delta, and anything you flagged as
"suspicious-but-kept".
