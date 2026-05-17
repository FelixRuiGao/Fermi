---
name: sql-schema
description: Design or review a relational database schema — tables, keys, types, constraints, indexes, normalization — for a specific engine. Use when modeling data, creating tables, or reviewing a schema design.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; relational design principles (no text reused)
---

# SQL Schema Design

Model the data correctly first; performance tweaks come after correctness.

## 1. Understand the domain and engine

What entities, relationships (1:1, 1:N, M:N), cardinalities, access patterns,
and scale? Which engine (Postgres/MySQL/SQLite/SQL Server) — types, constraint
support, and index features differ. `$ARGUMENTS` is the domain/task. If
extending an existing schema, read it and match its conventions.

## 2. Design principles

- **Keys**: a stable primary key per table (surrogate `bigint`/`uuid` is usually
  safer than a natural key that can change). Define **foreign keys** with
  explicit `ON DELETE`/`ON UPDATE` behavior — don't leave referential integrity
  to the app.
- **Types**: the tightest correct type. Money = `numeric`/`decimal`, never
  float. Timestamps with timezone (`timestamptz`). Enums/check constraints over
  free strings for closed sets. Right-sized integers.
- **Constraints encode invariants**: `NOT NULL`, `UNIQUE`, `CHECK` — the
  database is the last line of defense; use it.
- **Normalize to ~3NF** to avoid update anomalies; denormalize only
  deliberately for a measured read pattern, and document why.
- **M:N** via a junction table with its own constraints.
- **Indexes**: index FK columns and frequent filter/sort/join columns; composite
  index column order matters (equality → range); don't over-index (write cost).
- Naming: consistent convention (snake_case, singular vs plural — pick one),
  predictable FK names.

## 3. Migrations & safety

Deliver as a migration (up **and** down) compatible with the project's tool.
Flag operations that lock or rewrite large tables (adding a NOT NULL column with
default on a huge table, type changes) and give the online-safe pattern. Never
propose dropping a column/table without calling out the data loss.

## 4. Verify

Provide DDL, a short rationale (keys, the normalization choices, the indexes and
which query each serves), and the assumptions made. Note tradeoffs explicitly.
