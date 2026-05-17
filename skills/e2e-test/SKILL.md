---
name: e2e-test
description: Write a reliable end-to-end / browser test (Playwright, Cypress, etc.) that exercises a real user flow without flakiness. Use when adding E2E/integration UI tests or stabilizing a flaky one.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; E2E testing best practice (no text reused)
---

# End-to-End Test

E2E tests catch what unit tests can't — and flake more than anything else.
Optimize for reliability.

## 1. Match the project's harness

Detect Playwright/Cypress/WebdriverIO/Selenium and its config (base URL, fixture
setup, auth helper). Follow existing E2E patterns. `$ARGUMENTS` is the flow to
cover.

## 2. Test a user journey, not a page

Script what a user actually does end to end (e.g. "sign in → add to cart →
checkout → see confirmation"), asserting user-visible outcomes — not internal
state or implementation.

## 3. Kill flakiness by construction (the whole game)

- **No fixed sleeps.** Wait on conditions/events — Playwright auto-waiting /
  `expect(locator).toBeVisible()`, Cypress retry-ability. Never
  `wait(3000)`.
- **Resilient selectors**: `getByRole`/`data-testid`/accessible name — not
  brittle CSS/XPath that breaks on restyle.
- **Deterministic data & isolation**: each test sets up and tears down its own
  state; no order dependence; seed/clean the backend or mock the network at the
  boundary; control time/randomness.
- **Stable environment**: known viewport, app fully ready before acting, handle
  animations.
- Keep tests independent and parallel-safe (unique data per test, no shared
  mutable fixtures).

## 4. Verify it's actually stable

Run the test repeatedly (e.g. 10–20× and `--repeat-each`/headed+headless) and in
parallel — it must be 100% green. A test that passes once is not done; a flaky
E2E test is worse than none (see `flaky-test`). Capture trace/video on failure
for diagnosability. Report the flow covered, the stability run count, and any
part of the journey you stubbed and why.
