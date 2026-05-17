---
name: readme
description: Generate or refresh a project README that lets a newcomer understand, install, and use the project quickly. Use when asked to write, improve, or update a README.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; common README/standard-readme conventions (idea-level)
---

# README

Write for someone who just landed on the repo and has five minutes.

## 1. Learn the project from the code, not assumptions

Inspect: package manifest (name, scripts, entrypoints, deps), language/stack,
how it's actually run/built/tested, CLI/API surface, license file, existing
docs. Don't claim features that aren't there. `$ARGUMENTS` may set scope (e.g.
"just the install section"). If a README exists, improve it in place and keep
its accurate parts.

## 2. Structure (include only sections that apply)

1. **Title + one-sentence description** — what it is and who it's for, no fluff.
2. **Badges** — build/version/license, only if real.
3. **Why / features** — 3–6 bullets of concrete capabilities.
4. **Quick start** — copy-pasteable install + the *smallest* working example.
   This is the most important section; make it actually run.
5. **Usage** — common real tasks; show commands and expected output.
6. **Configuration** — env vars/flags, defaults, where config lives.
7. **Development** — how to set up, build, test, contribute.
8. **License** — match the actual LICENSE file.

## 3. Quality bar

- Every command must be correct and runnable as written (verify against the
  actual scripts/CLI).
- Lead with the common case; push edge cases and exhaustive reference to deeper
  docs.
- Concrete over abstract: real commands and output, not "simply configure it".
- Keep it tight — a wall of text doesn't get read. Link out for depth.
- No invented benchmarks, roadmap promises, or features.

Report which sections you added/updated and anything you couldn't verify from
the repo (so the user can fill it in).
