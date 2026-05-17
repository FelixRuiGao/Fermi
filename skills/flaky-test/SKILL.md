---
name: flaky-test
description: Diagnose and stabilize a test that passes and fails non-deterministically. Use when a test is flaky, intermittent, or fails only sometimes or only in CI.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard test-reliability practice (no text reused)
---

# Flaky Test

A flaky test is itself a bug. Fix the nondeterminism — never paper over it with
a blind retry.

## 1. Confirm and characterize

Reproduce the flakiness: run the test in a loop and in isolation vs. with the
full suite.

```bash
for i in $(seq 1 50); do <run one test> || echo "FAIL on $i"; done
```

Note the pattern: fails in isolation? only with others? only in CI? only under
load/parallelism? `$ARGUMENTS` may name the test.

## 2. Identify the source of nondeterminism

Common causes:

- **Time**: real `sleep`, `Date.now()`/`time()` assertions, timezone/DST,
  timeouts too tight for CI's slower machines.
- **Order/shared state**: tests depending on execution order; leaked global/DB/
  filesystem state from another test; missing teardown.
- **Concurrency**: races, awaiting the wrong signal, fixed sleeps instead of
  awaiting a condition, parallel tests sharing a resource/port.
- **Unseeded randomness**: random data/UUIDs, hash/map iteration order.
- **External dependency**: real network/DNS/clock/service instead of a stub.
- **Resource limits**: ports, file handles, memory under parallel runs.

## 3. Fix the cause

- Inject/fake the clock; assert ranges or use fake timers, not real waits.
- Make each test set up and tear down its own isolated state; remove
  inter-test coupling.
- Replace fixed sleeps with "wait until condition" (poll/await the actual
  signal). Stub external services deterministically.
- Seed randomness explicitly.

Retrying, increasing a sleep, or `@flaky`-skipping is not a fix — it hides the
same nondeterminism that can break real behavior.

## 4. Prove stability

Re-run the loop (e.g. 50–100×) in the failing configuration; it must be 100%
green. Report the root cause, the fix, and the run count you used to confirm.
