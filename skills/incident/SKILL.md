---
name: incident
description: Drive an incident response and write a blameless postmortem — stabilize first, then timeline, root cause, impact, and action items. Use during/after an outage or production incident.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; SRE incident-management practice (no text reused)
---

# Incident Response

Two distinct modes: **stop the bleeding**, then **learn from it**. Don't confuse
them.

## 1. Mitigate first (if it's live)

Recovery before diagnosis — users first, root cause later.

- Assess impact/scope (who/what/how bad) and communicate status.
- Reach for the fastest **safe** mitigation: roll back the suspect deploy,
  disable the feature flag, fail over, scale, shed load. A clean rollback beats
  a clever forward fix mid-incident.
- These are high-blast-radius, often irreversible actions — **state the action
  and get the operator's go-ahead** unless they've delegated authority; never
  silently run a prod-destructive command.
- Capture evidence *as you go* (logs, metrics, timestamps — see `log-analysis`)
  so the postmortem isn't reconstructed from memory.
- Confirm recovery with a real signal, not hope.

## 2. Find the root cause (after stable)

Hypothesis-driven (see `debug`), correlating the timeline: what changed right
before? deploy, config, traffic, dependency, data, infra. Distinguish trigger
from underlying cause and from contributing factors.

## 3. Blameless postmortem

Follow the org's template if one exists. Otherwise:

- **Summary**: what happened, user impact, duration.
- **Timeline**: detection → escalation → mitigation → resolution, with
  timestamps.
- **Root cause** + contributing factors. **Blameless**: systems and gaps, not
  people ("the deploy lacked a canary", not "X pushed bad code").
- **What went well / poorly / got lucky.**
- **Action items**: concrete, owned, prioritized — prevention, detection
  (the missing alert), and faster mitigation. Each one tracked, not aspirational.

Don't fabricate a timeline or cause to look complete — explicitly mark
unknowns/"still investigating". Output the doc and the prioritized action list.
