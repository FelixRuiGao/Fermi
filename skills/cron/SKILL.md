---
name: cron
description: Write, explain, or debug a cron expression (including the platform's specific flavor) and the surrounding job definition. Use when asked to schedule a job or interpret a cron schedule.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard cron / crontab semantics (no text reused)
---

# Cron

Get the schedule right and state what it means in plain English so it can be
double-checked.

## 1. Identify the flavor

`$ARGUMENTS` is the schedule or intent. Flavors differ — confirm which:

- **Standard 5-field**: `min hour dom month dow` (Vixen/crontab).
- **6/7-field with seconds/year**: Quartz, Spring `@Scheduled`, some cloud
  schedulers — field count and `?`/`L`/`W`/`#` specials differ.
- **systemd timers** use `OnCalendar=` (different syntax entirely).
- Cloud (AWS EventBridge, GCP, k8s CronJob) — note timezone handling and the
  6-field quirks.

## 2. Build it

- Map the human requirement to fields; use ranges (`1-5`), lists (`1,15`),
  steps (`*/15`), not hand-enumerated values when a step is clearer.
- **Day-of-month + day-of-week together is a trap**: in Vixie cron it's an OR,
  not an AND. If the user wants "1st of the month *and* a Monday", that needs a
  guard in the job, not cron alone — call this out.
- State the **timezone**: classic cron uses the system/`CRON_TZ` zone; many
  schedulers default to UTC. DST can skip/duplicate runs around the transition.
- Avoid `* * * * *` unless truly intended; avoid thundering-herd `0 0 * * *` on
  shared infra (jitter the minute).

## 3. Deliver

Give the expression, a one-line plain-English reading ("at 03:30 every
weekday"), the next 3–5 fire times, the assumed timezone, and any caveat (DOM/DOW
gotcha, DST, overlap if the job runs long — recommend a lock). If a tool like
`cronitor`/`croniter` is available, verify the next-run times rather than
computing by hand.
