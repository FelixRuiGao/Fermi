---
name: todo-scan
description: Inventory and triage TODO/FIXME/HACK/XXX markers in the codebase — classify by severity, find stale/done ones, and turn the important ones into actionable items. Use when auditing tech-debt markers.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; tech-debt triage practice (no text reused)
---

# TODO Scan

Comment markers are an unmanaged debt backlog. Surface it and make it
actionable.

## 1. Collect

```bash
rg -n --no-heading -e 'TODO' -e 'FIXME' -e 'HACK' -e 'XXX' -e 'BUG' -e 'OPTIMIZE' \
   -e 'DEPRECATED' --glob '!{node_modules,dist,build,vendor,.git}/**'
```

Scope to `$ARGUMENTS` (a path) or the current diff if the user only cares about
new ones. Capture file:line, marker type, author/date via `git blame` for age.

## 2. Triage each

For every marker, read the surrounding code and classify:

- **Stale / done**: the thing is already handled or no longer applies → the
  marker is lying; remove it (a fixed FIXME is comment-rot — see `comment-rot`).
- **Real & important**: a correctness/security/data risk hiding behind a
  casual `// FIXME`. Escalate — these are bugs, not notes.
- **Real & minor**: legitimate deferred work; keep but make it trackable.
- **Vague**: "TODO: improve this" with no actionable meaning → either make it
  specific or delete it; noise markers train people to ignore all markers.
- **Ancient**: years-old `HACK` no one remembers — flag for a decision (is the
  hack load-bearing now?).

## 3. Make it actionable

- Quick, safe, in-scope fixes you can do now → propose doing them (don't bundle
  unrelated fixes silently — see `scope-check`).
- Important deferred items → recommend filing as issues with the file
  reference, or converting to a tracked format the project uses.
- Note who/when for context, not blame.

## 4. Report

A prioritized table: **Act now / File as issue / Fix the marker / Delete as
noise**, with `file:line` and a one-line recommendation each. Lead with anything
that's actually a latent bug or security issue. Don't mass-delete markers — each
is a decision.
