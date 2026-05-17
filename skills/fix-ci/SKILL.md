---
name: fix-ci
description: Diagnose and fix a failing CI run — fetch the failing job's logs, find the root cause, apply a real fix, and verify it locally. Use when CI checks are red or a pipeline is failing.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Fix CI

Make the pipeline green by fixing the actual problem — never by masking it
(no removing the check, loosening thresholds, or `--no-verify` unless the user
explicitly decides that's the right call).

## 1. Get the failing logs

GitHub Actions (most common):

```bash
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view <run-id> --log-failed         # only the failed steps
```

If `$ARGUMENTS` has a run id or PR number, use it. For other CI systems, read the
pipeline config (`.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`,
`azure-pipelines.yml`, `Jenkinsfile`) to learn the exact commands and how to get
logs.

## 2. Find the root cause

Read the error itself, not just the red ✗. Classify it:

- **Build/compile** — type error, missing import, syntax.
- **Test** — a real regression vs. a flaky/order-dependent test vs. an
  environment difference (timezone, locale, missing service).
- **Lint/format/typecheck** — style or static-analysis gate.
- **Dependency** — lockfile drift, version conflict, registry/network.
- **Infra/config** — wrong runner, missing secret/env, cache, matrix.

## 3. Reproduce locally

Run the *same* command the failing job runs (copy it from the workflow file).
Reproducing locally is the fastest path to a confident fix and confirms it's not
infra-only.

## 4. Fix and verify

- Fix the underlying cause.
- Re-run the exact local command until it passes.
- If it's genuinely a flaky test, say so explicitly and fix the flakiness
  (deterministic seeds, awaited async, isolated state) rather than retrying CI.
- Summarize: what failed, why, the fix, and how you verified it. Push only if the
  user asks.
