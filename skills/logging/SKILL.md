---
name: logging
description: Add or improve application logging — structured, leveled, correlated, and free of secrets — using the project's logging stack. Use when adding observability or fixing noisy/unhelpful logs.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; structured-logging best practice (no text reused)
---

# Logging

Logs exist to answer "what happened and why" during an incident. Optimize for
that, not for `print`-debugging left behind.

## 1. Use the project's logger

Find and use the existing logging library/config (don't introduce a second
one, and replace stray `print`/`console.log`). Match its setup, format, and
field conventions. `$ARGUMENTS` may scope the area.

## 2. Do it right

- **Levels with meaning**: ERROR = needs attention/something failed; WARN =
  recoverable anomaly; INFO = significant business/lifecycle events; DEBUG =
  diagnostic detail. Don't log everything at INFO; don't log routine success at
  WARN.
- **Structured, not string-concatenated**: log an event name + key/value fields
  (`logger.info("order_placed", order_id=…, amount=…)`), so it's queryable.
  Avoid f-string-baked messages that can't be filtered.
- **Correlation**: include a request/trace/correlation ID so one operation can
  be followed across logs/services (see `log-analysis`).
- **No secrets / PII**: never log passwords, tokens, keys, full card/SSN, auth
  headers, request bodies with credentials. Redact. This is the most common
  logging bug.
- **Context on errors**: log the exception with stack + the inputs needed to
  reproduce — once, at the boundary, not at every rethrow.
- **Cost & noise**: no logging in hot loops; no logging that duplicates a
  metric; sample high-volume events. A log nobody reads is just cost.
- **Actionable messages**: state what happened and ideally the next step, not
  "error occurred".

## 3. Verify

Run the code path and confirm the logs are produced, parseable, at the right
level, and contain no secrets. Report what was added/changed and any noisy or
secret-leaking log you removed. Don't leave temporary debug logging behind.
