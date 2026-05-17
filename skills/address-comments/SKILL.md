---
name: address-comments
description: Read unresolved review comments on the current branch's pull request and implement the requested changes. Use when asked to address PR feedback or respond to reviewer comments.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Address PR Comments

Turn reviewer feedback into committed changes, without losing track of any thread.

## 1. Locate the PR and pull every comment

```bash
gh pr view --json number,url,title
gh pr view <n> --json reviews --jq '.reviews[] | {author:.author.login,state,body}'
gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate \
  --jq '.[] | {path,line,user:.user.login,body,in_reply_to_id}'
```

Use `$ARGUMENTS` as the PR number if provided; otherwise infer from the current
branch.

## 2. Triage

Sort comments into:

- **Actionable** — a concrete change is requested.
- **Question** — needs an answer, maybe not a code change.
- **Discussion / non-blocking** — note it, decide with the user if unclear.

For each actionable item, restate what you understand the reviewer wants. If two
comments conflict, or a request would regress something, **stop and ask the
user** rather than guessing.

## 3. Implement

- Group related comments into coherent commits (don't make one commit per
  nitpick unless the repo prefers that).
- Make the change where the comment points; check it doesn't break adjacent code
  or tests.
- Run the relevant tests/linters after each group.

## 4. Close the loop

Summarize, per thread: what the reviewer asked → what you changed
(`file:line`) → "done" or "needs discussion: …". Reply to / resolve threads via
`gh` only if the user wants you to (it's visible to others). Push only on the
user's go-ahead.
