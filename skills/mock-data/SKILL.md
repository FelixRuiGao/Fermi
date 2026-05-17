---
name: mock-data
description: Generate realistic synthetic test/seed/fixture data that respects the schema, types, and constraints — for tests, demos, or local dev — without using real personal data. Use when you need fake but plausible data.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; recommends faker libraries (MIT) — user-installed
---

# Mock Data

Realistic enough to exercise the system, structurally valid, and never real
personal data.

## 1. Derive the shape from the real schema

Read the model/schema/migration/type (`$ARGUMENTS` points at it). Mirror it
exactly: field types, nullability, enums, lengths, formats, ranges, and
**referential integrity** (FKs point to rows that exist; unique constraints
hold). Data the system would reject is worthless for testing.

## 2. Generate plausibly

- Use a maintained faker (`@faker-js/faker`, Python `faker`, `factory_boy`,
  Go `gofakeit`) — preflight-install on demand; they're MIT, not bundled. Don't
  hand-roll `"test1","test2"` — it won't surface formatting/encoding bugs.
- **Deterministic**: seed the generator so runs are reproducible (essential for
  stable tests — see `flaky-test`).
- Realistic distributions, not all-uniform: a few power users, many light ones;
  realistic dates (past for created_at, some nulls where optional), valid-format
  emails/phones/IDs, occasional unicode/long strings/edge values so tests catch
  real bugs.
- Respect business rules (an order's total matches its line items;
  end_date > start_date).

## 3. Privacy — non-negotiable

Never copy production/real PII into fixtures or seeds. If asked to "use prod
data", refuse that and instead generate synthetic data with the same shape (or
properly anonymize/mask — and say which). Synthetic values must be obviously
fake (use faker's reserved test ranges where they exist).

## 4. Deliver and verify

Output in the project's fixture/seed/factory format and location. Load it
through the real path (seed script / factory / import) to prove it satisfies
every constraint — generation that the DB then rejects isn't done. Report
volume, the seed used, and any constraint that forced a tradeoff.
