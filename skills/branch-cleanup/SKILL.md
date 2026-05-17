---
name: branch-cleanup
description: Safely prune local git branches that are already merged or whose upstream was deleted. Use when tidying up local branches after merges.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard git branch hygiene (no text reused)
---

# Branch Cleanup

Remove dead local branches without ever destroying unmerged work.

## 1. Refresh remote state

```bash
git fetch --prune
```

## 2. Build the candidate list

Protected by default: the current branch, `main`, `master`, `develop`, and
anything matching `release/*` or globs passed in `$ARGUMENTS`.

**Merged branches** (safe — fully contained in the base):

```bash
git branch --merged <main-or-default> | grep -vE '^\*|(^|\s)(main|master|develop)$'
```

**Branches whose upstream is gone** (remote deleted after merge):

```bash
git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads \
  | awk '$2=="[gone]"{print $1}'
```

## 3. Confirm, then delete

- **Show the full list and what category each branch is in. Do not delete until
  the user confirms** — branch deletion is destructive.
- Delete merged branches with `git branch -d` (refuses unmerged — that's the
  safety net). Keep it.
- A `[gone]` branch may still hold unmerged commits. For those, show
  `git log <base>..<branch> --oneline` first; only use `git branch -D` (force)
  on a specific branch the user explicitly approves after seeing its unmerged
  commits.
- Never script a blanket force-delete.

Report what was deleted and what was deliberately kept (and why).
