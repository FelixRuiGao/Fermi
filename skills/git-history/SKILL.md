---
name: git-history
description: Tidy a feature branch's commit history before review — squash fixups, reword, reorder, split — safely via interactive rebase, without losing work or rewriting shared history. Use before opening/finalizing a PR.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; safe history-rewriting practice (no text reused)
---

# Git History Cleanup

A clean, reviewable history helps reviewers and `git bisect`. But history
rewriting is destructive — guardrails are mandatory.

## 1. Safety gates first

- **Only rewrite local/unshared history.** Confirm the branch isn't a shared
  base others build on. Rewriting `main` or a branch others have pulled is
  off-limits — say so and stop if asked.
- **Make a safety net before rewriting**: note the current SHA or
  `git branch backup/<name>` (a free, instant restore point;
  also recoverable via `git reflog`).
- Identify the upstream base so you rebase the right range
  (`git log --oneline <base>..HEAD`). `$ARGUMENTS` may specify the base or
  intent.

## 2. Do the cleanup

`git rebase -i <base>` — apply intentionally:

- **squash/fixup** "wip", "fix typo", "address review" commits into the logical
  commit they belong to (`git commit --fixup=<sha>` + `rebase -i --autosquash`
  is the clean workflow).
- **reword** vague messages to follow the repo's convention (see `commit`).
- **reorder** so each commit is coherent; **split** an oversized commit into
  reviewable units (`edit` + `git reset -p`).
- Goal: each commit builds and tells one clear story — not one giant commit, not
  50 noise commits.

(Note: interactive rebase needs a real editor session — drive it deliberately,
verifying the todo list before executing; abort with `git rebase --abort` if it
goes wrong, then restore from the backup ref.)

## 3. Verify nothing was lost

After the rebase:

- `git range-diff <old-base>...<old-tip> <base>...HEAD` (or diff against the
  backup ref) → confirm the **final tree is identical**; only history shape
  changed, no code lost.
- Build + tests green on the final commit (and ideally each commit).
- Force-push, if needed, only to your **own** branch and prefer
  `--force-with-lease` (refuses if someone else pushed) — and only with the
  user's go-ahead.

Report: what you squashed/reworded/reordered, the range-diff result (proof no
content changed), and the exact (lease-guarded) push command for the user to
run.
