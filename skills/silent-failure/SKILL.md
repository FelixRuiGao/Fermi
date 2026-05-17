---
name: silent-failure
description: Hunt for swallowed errors, empty catch blocks, ignored return values, and fallbacks that hide failure. Use when auditing code or a diff for error-handling that masks problems.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Silent Failure Hunter

Find the places where something goes wrong and the code pretends it didn't.
These bugs are invisible until they cause damage in production.

## 1. Scope

Default to the current change (`git diff <base>...HEAD`); `$ARGUMENTS` may target
a path. Grep is a good first pass, then read each hit in context — most patterns
need judgment, not just a match.

## 2. Patterns to find

- **Empty / log-only catch**: `catch {}`, `except: pass`, `catch (e) {}`, or a
  catch that logs and then continues as if nothing failed.
- **Swallowed rejections**: an unawaited promise, a `.catch(() => {})`, a
  fire-and-forget async call whose failure no one observes.
- **Ignored return/err**: discarding a status/error return (Go `_ =`,
  unchecked `err`, ignoring a boolean "ok", not checking a syscall result).
- **Over-broad catch**: catching `Exception`/`Throwable`/`any` around a wide
  block, so unrelated bugs get hidden with the expected error.
- **Masking fallback**: `?? defaultValue` / `try X except: return []` /
  `value || fallback` that turns a real failure into plausible-looking empty or
  default data the caller can't distinguish from success.
- **Lost context**: re-throwing or wrapping that drops the original cause/stack.

## 3. Judge each one

A caught-and-handled error is fine. The bug is when the failure is *hidden* —
the program continues in a wrong/degraded state and nothing (caller, log,
metric, user) can tell. For each real finding: `file:line`, the failure mode it
hides, the concrete consequence, and the fix (propagate, handle meaningfully, or
fail loudly). Don't flag legitimate, intentional, documented suppression.
