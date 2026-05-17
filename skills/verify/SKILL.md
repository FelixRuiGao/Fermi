---
name: verify
description: Independently check that completed work actually satisfies the original requirement, not just that it looks done. Use before declaring a task finished, or when asked to verify/double-check work.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Verify Work

Adversarially check the work against what was actually asked. Assume it's wrong
until evidence says otherwise.

## 1. Restate the requirement

Write down, concretely, what "done" means for this task — every explicit ask and
every reasonable implicit acceptance criterion. If `$ARGUMENTS` or the
conversation is ambiguous about success criteria, list your assumptions.

## 2. Check each criterion against reality

For every criterion, get **evidence**, don't reason from intent:

- Run the build / typecheck / linter — actually run them, read the output, check
  the exit code (empty output from `tsc --noEmit` means success).
- Run the relevant tests; confirm they exercise the new behavior, not just that
  the suite is green.
- Exercise the actual feature (CLI command, request, function call, UI path)
  including the golden path *and* the edge/error cases stated in the task.
- Diff the change: does it do only what was asked, with no unrelated breakage?
  Check for regressions in adjacent behavior.

## 3. Hunt for the gaps

- Requirements silently dropped or only partially implemented.
- "TODO", stubs, hardcoded values, commented-out code left behind.
- Error/edge paths that were specified but not handled.
- Claims of success not backed by an actual run.

## 4. Verdict

State plainly: **PASS** (criterion → evidence) or **FAIL / INCOMPLETE**
(what's missing, where, why). If something could not be verified (no environment,
can't run UI), say so explicitly — never imply success you didn't observe. A
truthful "not done" is the correct output when the work isn't done.
