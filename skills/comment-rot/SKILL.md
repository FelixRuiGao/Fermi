---
name: comment-rot
description: Find comments, docstrings, and doc strings that no longer match the code they describe, and fix or remove them. Use when auditing a diff or file for stale or misleading documentation.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Comment Rot

A wrong comment is worse than no comment — it actively misleads. Find the lies.

## 1. Scope

Default to the current change (`git diff <base>...HEAD`); `$ARGUMENTS` may target
a path. Reviewing a diff is the highest-value case: code moved, the comment
didn't.

## 2. For each comment/docstring, compare to the code it documents

Flag when:

- It describes **old behavior** — parameters, return values, side effects, or
  algorithms that changed.
- It references a **renamed/removed** symbol, file, function, flag, or ticket.
- The **example** in a docstring would no longer run or produces a different
  result.
- It states an **invariant or constraint** the code no longer enforces.
- It says "TODO/FIXME/HACK" for something already done or no longer true.
- It explains **what** trivially obvious code does (noise) rather than the
  non-obvious **why**.
- A doc comment's `@param`/`@returns`/types disagree with the signature.

## 3. Fix

- Stale-but-useful → rewrite to match current behavior, concisely, focusing on
  the *why*/constraint.
- Pure noise or restating the code → delete it.
- Reveals an actual code bug (comment says the right thing, code does the wrong
  thing) → **don't just edit the comment** — surface the bug to the user.

Do not add new comments that merely narrate the code. Report each fix as
`file:line — was → now (or removed)`, and separately list any code bugs the
audit exposed.
