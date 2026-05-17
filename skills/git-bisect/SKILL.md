---
name: git-bisect
description: Find the exact commit that introduced a regression using git bisect, automated with a reproduction command when possible. Use when a bug appeared at an unknown point in history.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard git bisect workflow (no text reused)
---

# Git Bisect

Binary-search history for the commit that broke something.

## 1. Define good, bad, and a test

- **bad**: a ref where the bug exists (default `HEAD`).
- **good**: a ref where it did not (an old tag/commit the user trusts, or ask).
- **reproduction**: a single command that **exits non-zero when the bug is
  present** and zero when it isn't. This is the crux — make it precise and fast.
  It can be a test (`npm test -- t/foo`), a script, or a one-liner grep on
  program output.

`$ARGUMENTS` may supply `<bad> <good>` refs.

## 2. Run it

Automated (preferred):

```bash
git bisect start <bad> <good>
git bisect run <reproduction-command>
git bisect reset
```

`git bisect run` checks out the right commits itself and converges on the first
bad commit. Make sure the command rebuilds/reinstalls if compiled output or deps
matter (wrap it: `sh -c 'npm ci && npm test -- t/foo'`).

Manual (when the check needs human judgment): `git bisect start`,
`git bisect bad`, `git bisect good <ref>`, then at each step verify and run
`git bisect good` or `git bisect bad` until git reports the culprit. Always
finish with `git bisect reset`.

## 3. Report

Identify the first bad commit (`git show <sha> --stat`), explain *why* it likely
caused the regression (the specific change), and propose the fix or a revert.
Mention any commits `bisect` had to `skip` (didn't build) and how that affects
confidence.
