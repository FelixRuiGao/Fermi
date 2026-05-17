---
name: release-notes
description: Write user-facing release notes / announcement prose from the changes in a release — benefits-first, grouped, readable, honest about breaking changes. Use when announcing a release (distinct from the structured CHANGELOG).
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; release-communication practice (no text reused)
---

# Release Notes

Different from a changelog: a changelog is a structured ledger; release notes
are a readable announcement that tells users *why they should care*.

## 1. Gather the real changes

Determine the range (last tag → HEAD, or `$ARGUMENTS`):

```bash
git log --no-merges <last-tag>..HEAD --pretty='%s'
git diff <last-tag>..HEAD --stat
```

Also pull the `CHANGELOG.md` Unreleased section if present, and any linked
issues, so notes match the structured record.

## 2. Translate changes → user value

- Lead with **highlights**: the 1–3 changes users will most care about, written
  as benefits ("Imports are now ~2× faster") not commits ("refactor import
  loop").
- Group the rest: **New**, **Improved**, **Fixed**, **Deprecated**,
  **Breaking**. Omit pure-internal churn (refactors, test-only, CI) — users
  don't care.
- Each item: plain language, the user's vocabulary, one line, link to detail/PR
  if the project does.

## 3. Be honest and useful

- **Breaking changes up top, unmissable**, each with the exact migration step.
  Burying these destroys trust.
- Don't oversell. No invented benchmarks, no "revolutionary"; state real
  improvements plainly. Don't fabricate a highlight to pad a thin release.
- Credit contributors if the project's convention does.
- Include upgrade instructions and any required action.

## 4. Deliver

Format to the channel (GitHub release body, blog, in-app) — match the project's
prior release-notes style and CLAUDE.md/CONTRIBUTING release convention if any.
Keep it skimmable: a reader should get the gist in 15 seconds and the migration
steps without hunting. Note anything you couldn't determine from history rather
than guessing.
