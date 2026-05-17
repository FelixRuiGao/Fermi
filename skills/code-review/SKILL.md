---
name: code-review
description: Review code changes (uncommitted, a branch vs its base, or a GitHub PR) for bugs, security, regressions, and design problems, reported by severity with concrete fixes. Use when asked to review code or a PR.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Code Review

A focused review that finds real problems and does not pad with noise.

## 1. Establish scope

From `$ARGUMENTS`:

- A number like `123` → a GitHub PR: `gh pr view 123`, `gh pr diff 123`.
- A git ref/range (`abc123`, `main..HEAD`) → review that diff.
- A path → review that file/dir.
- Empty → review local work: `git diff` (unstaged) + `git diff --staged` +
  committed-vs-base (`git diff <base>...HEAD`).

Read enough surrounding code to judge the change in context — a diff alone hides
callers, invariants, and prior art.

## 2. Review dimensions

Go through these deliberately:

- **Correctness** — logic errors, off-by-one, wrong conditionals, unhandled
  cases, broken edge cases, incorrect async/await.
- **Security** — injection (SQL/command/path), missing authz, unsanitized input,
  secrets in code, unsafe deserialization, SSRF, XSS.
- **Error handling** — swallowed exceptions, empty `catch`, fallbacks that hide
  failure, unchecked results, resource leaks (unclosed files/handles).
- **Concurrency** — races, unsynchronized shared state, deadlock, await-in-loop.
- **Performance** — accidental O(n²), N+1 queries, work in hot paths,
  unbounded growth.
- **API & contracts** — breaking changes, inconsistent signatures, nullability.
- **Tests** — are the new/changed paths actually covered? Do tests assert
  behavior, not implementation?
- **Clarity** — naming, dead code, misleading comments, needless complexity.

## 3. Report

Group findings by severity; lead with the worst:

- **Critical** — data loss, security hole, crash, corruption.
- **High** — wrong behavior in a common path.
- **Medium** — edge-case bug, missing test, risky pattern.
- **Low** — clarity/style/nit.

For each finding: `file:line` — what's wrong — why it matters — a concrete fix
(or patch). Also note 1–2 things done *well*. If a category is clean, say so
briefly. State your confidence and what you could not verify (e.g. couldn't run
tests). Do not invent issues to look thorough.
