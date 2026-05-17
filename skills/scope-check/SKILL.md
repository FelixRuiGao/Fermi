---
name: scope-check
description: Check a change against the original request to catch scope creep and unrelated edits, keeping the diff minimal and on-target. Use before finishing or committing, or when a change is growing beyond the ask.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; minimal-diff discipline (no text reused)
---

# Scope Check

The best change does exactly what was asked and nothing more. Verify that.

## 1. Restate the ask precisely

Write down the actual requested change in one or two sentences (`$ARGUMENTS` or
the conversation). This is the yardstick.

## 2. Diff every change against it

`git diff` (+ staged + untracked). For each hunk, classify:

- **On-target** — directly implements the request. Keep.
- **Necessary support** — required for the above to work (a new import, a
  signature change the feature needs). Keep, but confirm it's truly required.
- **Scope creep** — opportunistic refactor, drive-by reformat of untouched
  code, renamed unrelated symbols, a "while I'm here" improvement, an unrelated
  bug fix, speculative abstraction/config for a future that isn't this task.

## 3. Handle the creep

- Pure reformatting of lines the task didn't touch → revert it (it bloats the
  diff and hides the real change in review).
- A genuine improvement/bug you spotted but isn't this task → **don't silently
  bundle it.** Revert it from this change and surface it separately (a note, a
  follow-up, or Fermi's spin-off mechanism) so it gets its own review.
- Unfinished/half-applied edits or leftover debug code/TODOs → remove.

A bug fix doesn't need surrounding cleanup; a one-shot change doesn't need a new
abstraction. Three similar lines beat a premature helper.

## 4. Report

State: the change is in scope (yes/no), what (if anything) you reverted as
creep, and what you flagged for separate follow-up. The deliverable is a tight,
reviewable diff that maps 1:1 to the request — plus a list of out-of-scope items
preserved for the user to decide on, not lost.
