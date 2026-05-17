---
name: commit-split
description: Split a large, mixed working tree into a series of small, coherent, individually-reviewable commits. Use when changes have piled up and need to be committed as clean atomic units.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; atomic-commit discipline (no text reused)
---

# Commit Split

One giant "misc changes" commit is unreviewable and un-revertable. Carve the
working tree into atomic commits — each one coherent, building, and explainable
in a sentence.

## 1. Survey what's uncommitted

```bash
git status --short
git diff            # unstaged
git diff --staged   # already staged
```

Group the changes by *intent*, not by file: e.g. "the bug fix", "the refactor it
needed", "an unrelated typo", "new tests". A single file often contains hunks
belonging to different logical commits.

## 2. Stage by intent, not by file

- Use **hunk-level** staging: `git add -p` (split/`s`, edit/`e` hunks) or
  `git add <path>` only when the whole file is one concern.
- Build commit 1 = the smallest coherent unit (often the core change). Stage
  exactly its hunks, leave the rest unstaged.
- If a file mixes concerns and `-p` can't separate them cleanly, stage the file,
  then `git restore --staged -p` or stash-split — don't force unrelated hunks
  together.
- Keep refactor commits separate from behavior-change commits (see `refactor`,
  `scope-check`); unrelated drive-by fixes get their own commit.

## 3. Commit each unit well

For each staged set: verify it's self-contained (ideally compiles/tests on its
own — a commit that doesn't build breaks `bisect`), then commit with a clear
Conventional message (see `commit`). Repeat until `git status` is clean.

## 4. Verify the sequence

- `git log --oneline` reads as a coherent story; each message matches its diff.
- Optionally check each commit builds:
  `git rebase --exec '<build/test>' <base>` (or spot-check the key ones).
- The final tree equals the original uncommitted state — nothing dropped:
  `git diff <recorded-start> -- .` should be empty after all commits.

Don't push; report the commit sequence and the reasoning for the split. If two
concerns are genuinely inseparable in one hunk, say so rather than mangling it.
