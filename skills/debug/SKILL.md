---
name: debug
description: Systematically find the root cause of a bug using a hypothesis-driven method instead of guessing. Use when something is broken, throwing, producing wrong output, or behaving unexpectedly.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; scientific-method debugging (no text reused)
---

# Root-Cause Debugging

Resist the urge to patch the first plausible line. Find *why* it breaks first.

## 1. Reproduce

Pin down the smallest reliable reproduction: exact input, command, environment,
and the precise observed vs. expected behavior. If you can't reproduce it, you
can't confirm a fix — gather more info (logs, stack trace, a failing test) before
changing anything. `$ARGUMENTS` may describe the symptom or point at a failing
test/command.

## 2. Locate

- Read the full error and stack trace top to bottom; map each frame to source.
- `git log`/`git blame` the suspect lines — did a recent change introduce this?
  (If history is large and the bug has a clear good/bad boundary, the
  `git-bisect` skill pinpoints the commit.)
- Trace data flow backward from the failure point to where the bad value /
  state originates. The crash site is usually a symptom, not the cause.

## 3. Hypothesize → test one variable at a time

State a specific hypothesis ("the value is null because X returns early when
Y"). Test it cheaply: a targeted log/print, a debugger breakpoint, an assertion,
or a unit test that isolates the suspected unit. Change **one thing**, observe,
keep or discard the hypothesis. Don't shotgun multiple edits at once.

## 4. Fix the cause, not the symptom

- Fix where the wrong state originates, not where it surfaces.
- Don't swallow the error or add a defensive `if` that hides it unless that is
  genuinely the correct behavior.
- Add or update a test that fails before the fix and passes after — this both
  proves the fix and prevents regression.
- Remove any temporary debug logging you added.

## 5. Confirm

Re-run the original reproduction and the test suite. State the root cause in one
sentence, the fix, and how you verified it. Note any related code that has the
same latent bug.
