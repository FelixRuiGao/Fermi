---
name: dependency-upgrade
description: Perform and verify a dependency or framework upgrade safely — read the changelog, apply codemods, fix breakages, and confirm with tests. Use when upgrading a package, framework, or runtime version.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Dependency Upgrade

Upgrade deliberately, one target at a time, with the test suite as the gate.

## 1. Establish a baseline

Identify current vs. target version (`$ARGUMENTS` names the package and/or
target; default = latest stable). Run the test suite **before** changing
anything — you need a known-green starting point to attribute breakages.

## 2. Read what changed

Before bumping, read the target's release notes / CHANGELOG / migration guide
(use web fetch/search for the official docs). Note breaking changes, removed
APIs, renamed exports, changed defaults, and any official codemod
(`npx <pkg>-codemod`, `react-codemod`, `django` upgrade guide, etc.).

## 3. Apply

- Bump the version via the package manager so the lockfile updates correctly
  (don't hand-edit the lockfile).
- For a major bump: prefer the official codemod, then fix the remaining
  call sites the codemod can't (read each compile/type/test error and fix the
  root cause).
- Update peer/related deps that the upgrade requires together.
- Keep the upgrade isolated — don't fold in unrelated refactors.

## 4. Verify thoroughly

Typecheck, lint, full test suite, and a build. For runtime/framework upgrades,
also exercise the app's main path (a major-version bump can pass tests and still
break at runtime). Report: versions (old → new), the breaking changes you
handled, files touched, and verification evidence. If a major upgrade is
high-risk or needs product decisions, stop and summarize the migration for the
user instead of forcing it through.
