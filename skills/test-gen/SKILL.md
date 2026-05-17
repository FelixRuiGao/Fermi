---
name: test-gen
description: Generate unit tests with meaningful edge cases for a function, module, or file, using the project's existing test framework and conventions. Use when asked to write or add tests.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Test Generation

Write tests that would actually catch a regression — not tests that just restate
the implementation.

## 1. Match the project

Before writing anything, learn the local conventions:

- Find the framework and runner (jest/vitest/mocha, pytest/unittest, go test,
  cargo test, JUnit, rspec…) from config and existing tests.
- Read 1–2 existing test files: file naming, directory, assertion style,
  setup/teardown, mocking approach, fixtures. New tests must look like they
  belong.

`$ARGUMENTS` is the target (file/function). If empty, ask or infer from recent
changes.

## 2. Analyze the target

Identify, for the unit under test:

- The contract: inputs → outputs / side effects.
- Branches and conditions (aim to exercise each).
- Boundaries: empty, zero, negative, max, off-by-one, very large.
- Special values: null/undefined/None, NaN, empty string/array/map, Unicode,
  duplicates, unsorted input.
- Error paths: invalid input, thrown exceptions, rejected promises, timeouts.
- State/order dependence and idempotency, if relevant.

## 3. Write the tests

- One behavior per test; descriptive names (`returns_empty_for_no_match`).
- Arrange–Act–Assert; assert observable behavior, not internal calls, unless the
  interaction *is* the contract.
- Cover the happy path, each meaningful edge case, and each error path.
- Mock only true external boundaries (network, clock, fs, randomness) — make
  them deterministic. Don't mock the thing you're testing.
- No flakiness: no real sleeps, no reliance on wall-clock or ordering.

## 4. Run them

Execute the suite. All new tests must pass (or, if they reveal a real bug,
report it clearly rather than weakening the test). Report coverage of the target
and any path you deliberately left untested and why.
