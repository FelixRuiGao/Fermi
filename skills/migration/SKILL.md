---
name: migration
description: Write a safe, reversible database schema/data migration — forward + rollback, online-safe for large tables, with a backfill plan. Use when changing a schema, adding/dropping columns, or moving data.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; zero-downtime migration practice (no text reused)
---

# Database Migration

Migrations run against real data in production. The bar is: reversible, and safe
under concurrent traffic.

## 1. Use the project's migration tool

Detect it (Alembic, Django, Rails/ActiveRecord, Prisma, Flyway, Liquibase,
`golang-migrate`, Knex) and follow its file naming, ordering, and up/down
conventions. Never hand-edit an already-applied migration — add a new one.
`$ARGUMENTS` describes the change.

## 2. Make it safe under load

A migration that locks a hot table = an outage. Apply the expand/contract
(parallel-change) pattern for anything non-trivial:

- **Additive first**: add nullable columns / new tables — cheap, safe. Adding a
  `NOT NULL` column *with default* on a big table rewrites it on some engines —
  add nullable, backfill, then add the constraint.
- **Backfill out-of-band**: populate data in batches (bounded, throttled), not
  in one transaction that locks the table.
- **Index creation**: use the concurrent/online variant
  (`CREATE INDEX CONCURRENTLY`, `ALGORITHM=INPLACE`) so writes aren't blocked.
- **Deploy in phases**: schema add → code writes both → backfill → code reads
  new → drop old. Each step independently deployable and reversible.
- **Destructive ops (drop column/table) last**, only after nothing references
  them, and call out the irreversible data loss explicitly.

## 3. Reversibility

Every migration needs a real `down`/rollback that returns the schema to the
prior state (or an explicit, documented note if it's genuinely irreversible —
e.g. a column drop — so the team knows the recovery is "restore from backup").
Recommend a backup before destructive steps (see the `backup` skill).

## 4. Verify

Run the migration up **and** down on a scratch/dev database; confirm the schema
and a data sample are correct both ways. State: the phased plan, lock/rewrite
risk per step, the backfill approach, and the rollback. Do not run it against
any shared/production database — hand the user the plan and commands.
