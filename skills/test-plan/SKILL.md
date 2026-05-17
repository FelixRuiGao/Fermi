---
name: test-plan
description: Produce a concrete test plan for a change or feature — what to test, at which level, including edge/failure cases and how to verify — before or alongside implementation. Use when planning how to validate work.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; test-strategy practice (no text reused)
---

# Test Plan

Decide *what proves this works* before declaring it done — so verification isn't
an afterthought.

## 1. Understand what's changing

From `$ARGUMENTS` / the diff / the spec, identify the behavior under change and
its blast radius (callers, data, integrations). Read the code; check the
existing test setup and coverage so the plan fits the project.

## 2. Plan by level (use the pyramid)

- **Unit**: each new/changed function's contract — happy path, every branch,
  boundaries, invalid input, error paths. The bulk of the plan.
- **Integration**: module/service/DB/API seams the change crosses; contracts
  between components.
- **End-to-end**: the 1–2 critical user journeys this affects (only the
  important ones — E2E is expensive; see `e2e-test`).
- **Non-functional** where relevant: performance/load, security (authz/input),
  accessibility, concurrency, migration/rollback.

## 3. Enumerate cases explicitly

For the changed behavior, list concrete cases as a checklist: normal inputs,
empty/null/zero/max boundaries, invalid input, failure of each dependency,
concurrency/idempotency if applicable, and **regression** cases for adjacent
behavior that could break. Each case: precondition → action → expected result.

## 4. Define "verified"

State exactly what must pass to call it done: which suites, manual steps for
anything not automatable (e.g. visual UI — say so honestly), and how to confirm
no regression. Flag risks that are hard to test and how you'll mitigate (e.g.
"can't reproduce the prod data shape — will test with a synthetic fixture").

Deliver the plan as an actionable checklist scaled to the change's risk (small
fix → a few cases; risky migration → thorough). It feeds the `verify` skill at
the end.
