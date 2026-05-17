---
name: pr-description
description: Generate a pull-request title and body from the commits and diff on the current branch versus its base. Use when opening a PR or writing/refreshing a PR summary.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Pull Request Description

Write a PR title and body that a reviewer can act on without reading every commit.

## 1. Determine the base

The base is what this branch will merge into — usually `main`, `master`, or
`develop`. If `$ARGUMENTS` names a base branch, use it. Otherwise:

```bash
git remote show origin | sed -n 's/.*HEAD branch: //p'   # default branch
git merge-base HEAD <base>
```

## 2. Gather the full picture

Look at **all** commits on the branch, not just the latest:

```bash
git log --no-merges --reverse <base>..HEAD
git diff --stat <base>...HEAD
git diff <base>...HEAD          # read the actual changes
```

## 3. Write it

**Title:** ≤ ~70 chars, imperative, no type prefix unless the repo's PRs use one.
Put detail in the body, not the title.

**Body:**

```markdown
## Summary
- 1–3 bullets: what changed and *why* (the problem this solves)

## Changes
- Notable implementation points a reviewer should focus on

## Test plan
- [ ] How this was verified / how to verify it

## Notes
- Breaking changes, migrations, follow-ups, or screenshots for UI changes
```

Guidelines:

- Lead with intent. The reviewer needs the *why* before the *what*.
- Call out anything risky, irreversible, or that needs a migration.
- For UI changes, leave an explicit placeholder for before/after screenshots.
- Only reference issues the user actually mentioned (`Closes #N`).
- Match the repo's `.github/PULL_REQUEST_TEMPLATE.md` if one exists.

## 4. Create or update (only if asked)

```bash
gh pr create --base <base> --title "…" --body "$(cat <<'EOF'
…
EOF
)"
```

Creating/editing a PR is visible to others — do it only when the user asks, and
report the PR URL.
