---
name: git-conflict
description: Resolve a git merge/rebase/cherry-pick conflict correctly — understand both sides, keep the right intent, and verify nothing was lost. Use when git reports conflicts or a rebase/merge is stuck.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard git conflict-resolution practice (no text reused)
---

# Git Conflict Resolution

A conflict means two changes touched the same place. Resolving it is a code
decision, not a text-merge — understand both intents before picking.

## 1. See the situation

```bash
git status                 # which operation (merge/rebase/cherry-pick), which files
git diff --name-only --diff-filter=U
git log --oneline --left-right --merge -- <file>   # the competing commits
```

`$ARGUMENTS` may name files/strategy. Know which operation you're in — **rebase
flips "ours"/"theirs"** (ours = the branch you're rebasing onto). Getting this
backward silently discards work.

## 2. Resolve by intent, per hunk

For each conflicted hunk: read both sides *and* the surrounding code. Ask "what
was each change trying to do?" The answer is usually **both** — integrate the
two intents, not blindly pick a side or naively concatenate. Delete the
`<<<<<<< ======= >>>>>>>` markers; make the result actually coherent (a merge
that keeps both halves of a renamed function compiles to garbage).

Watch for **semantic conflicts**: code that merges cleanly textually but is
logically broken (one side renamed a symbol the other side now calls). Grep for
the changed symbols across the file/codebase, not just the marked region.

## 3. Don't lose work

- Never resolve by mass `git checkout --ours/--theirs` on a whole file unless
  you're certain one side is entirely correct — it discards the other side
  silently.
- If unsure what a side intended, inspect that commit (`git show <sha>`) or ask
  the user — don't guess and bury someone's change.
- `git rerere` if the repo uses it.

## 4. Finish and verify

`git add` resolved files, continue (`git rebase --continue` / commit the merge).
Then **build + run the tests** — conflict resolution is the most regression-
prone git operation; a clean `git status` is not proof of correctness. Report
each file: which intents you combined and how you verified. If it's badly
tangled, `git rebase/merge --abort` and discuss strategy rather than forcing a
wrong resolution.
