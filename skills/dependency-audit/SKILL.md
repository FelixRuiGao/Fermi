---
name: dependency-audit
description: Find vulnerable or badly outdated dependencies and recommend safe upgrades. Use when asked to audit dependencies, check for CVEs, or assess dependency health.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; wraps each ecosystem's native audit tooling (their own licenses)
---

# Dependency Audit

Use the ecosystem's own vulnerability database — don't guess CVEs from memory
(memory is stale and unreliable for security).

## 1. Detect the ecosystem and run its auditor

- **npm/pnpm/yarn**: `npm audit --json` / `pnpm audit` / `yarn npm audit`
- **Python**: `pip-audit` (preferred) or `uv pip audit`; `pip list --outdated`
- **Rust**: `cargo audit` (RustSec)
- **Go**: `govulncheck ./...`
- **Ruby**: `bundle audit`
- **Java/Gradle/Maven**: OWASP dependency-check if available
- Cross-ecosystem: `osv-scanner -r .` if installed (covers many lockfiles)

These tools are the user's (or invoked transiently); they carry their own
licenses and pull live advisory data. If a tool isn't installed, state that and
recommend it rather than fabricating results.

## 2. Triage findings

For each advisory: package, installed vs. fixed version, severity, whether it's
a direct or transitive dep, and — importantly — whether the vulnerable code path
is actually reachable from this project. A transitive dev-only dependency is not
the same risk as a runtime crypto library.

## 3. Recommend upgrades by risk

- Patch/minor security fix → safe; apply and run the test suite.
- Major bump or one with breaking changes → flag separately, summarize the
  migration, and let the user decide (don't silently break the build).
- No fix available → note mitigations (config, removing the dep, pinning).

`$ARGUMENTS` may scope to one package or "outdated only". Output: a prioritized
table (Critical→Low), the exact upgrade commands, and verification (lockfile
updated + tests green). Don't bulk-bump majors as a side effect.
