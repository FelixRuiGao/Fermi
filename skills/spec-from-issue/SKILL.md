---
name: spec-from-issue
description: Turn a vague issue, ticket, or feature request into a concrete implementation spec — clarified requirements, scope, approach, and acceptance criteria — before any code. Use when starting work from a ticket.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; spec-driven development practice (no text reused)
---

# Spec From Issue

Most tickets are underspecified. Resolve the ambiguity *before* writing code, not
during review.

## 1. Read the request and the code

Get the issue (`gh issue view <n>` if `$ARGUMENTS` is a number, else the text).
Then read the relevant code so the spec is grounded in how the system actually
works — not a greenfield fantasy. Note linked issues/PRs/prior art.

## 2. Surface the unknowns

List what the ticket does **not** say but the implementation needs:
- Exact expected behavior, including edge/error cases.
- Scope boundaries — what's explicitly **out** of scope.
- Affected users/data/compat; migration or backfill needs.
- Non-functional: performance, security, accessibility, observability.
- UX specifics if user-facing.

Ask the user the questions you genuinely can't answer from the code/issue.
**Don't invent requirements or rationale to fill gaps** — an assumption stated
as fact becomes a wrong spec. Mark anything assumed as an explicit assumption.

## 3. Write the spec

- **Problem**: what and why (the user-facing motivation).
- **Goals / Non-goals**: bullets; non-goals prevent scope creep.
- **Approach**: the chosen implementation strategy and the main alternative
  considered (briefly) — enough that a reviewer can sanity-check the direction.
- **Changes**: components/files/APIs/schema affected; risks and how to mitigate.
- **Acceptance criteria**: a concrete, testable checklist that defines "done".
- **Test plan**: how it'll be verified (link to the `test-plan` skill for
  depth).
- **Open questions / assumptions**: explicit.

## 4. Confirm before building

Keep it proportional to the change (a one-liner doesn't need a doc). Get the
user's confirmation on scope and approach before implementation — realigning a
spec is cheap; rewriting code is not. Output the spec; don't start coding from
an unconfirmed one.
