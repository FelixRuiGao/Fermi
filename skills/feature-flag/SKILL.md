---
name: feature-flag
description: Add a feature flag cleanly, or fully remove a stale one (delete the dead branch, not just the flag). Use when gating new behavior behind a flag or cleaning up an obsolete flag.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; feature-flag lifecycle practice (no text reused)
---

# Feature Flag

A flag is temporary scaffolding. Add it cleanly; remove it completely.

## Adding a flag

- Use the project's existing flag system (LaunchDarkly/Unleash/config/env) —
  don't invent a parallel mechanism. Match naming conventions.
- Evaluate the flag at **one** well-defined boundary, not sprinkled through the
  code. Both branches must be coherent and tested.
- Default **off** (new behavior opt-in) unless told otherwise; safe fallback if
  the flag service is unreachable.
- Name it for what it gates and note its intended lifetime — it is debt with a
  due date, not permanent config.
- Keep the old path working until the flag is fully rolled out and removed.

## Removing a stale flag (the part people skip)

`$ARGUMENTS` names the flag. Removing it means deleting the **losing branch**,
not just the conditional:

1. Find every read of the flag (`grep` the exact key, including config,
   tests, docs, dashboards).
2. Decide the winning side (usually: the flag is now permanently on → keep the
   new behavior).
3. Delete the dead branch entirely — the old code path, its now-unreachable
   helpers, its tests, the flag definition/config, and any docs referencing it.
   Leftover dead branches are the whole reason flag debt is dangerous.
4. Simplify what's left (the conditional collapses — see `simplify`).

## Verify

Grep confirms zero remaining references to the flag key. Build + full test
suite green. Report: where the flag is evaluated (add) or every site removed
(remove), and confirm no dead branch remains. Don't leave a half-removed flag.
