---
name: sql
description: Write, explain, debug, or optimize a SQL query for a specific dialect, with correctness and performance in mind. Use when asked to write SQL, fix a slow query, or design a query.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard SQL/relational principles (no text reused)
---

# SQL

Correct first, fast second, and always for the actual dialect and schema.

## 1. Get the schema and dialect

Don't write blind. Find the table/column definitions (migration files, `\d`,
`SHOW CREATE TABLE`, ORM models). Identify the dialect — **PostgreSQL, MySQL,
SQLite, SQL Server, Oracle, BigQuery** differ in functions, quoting,
`LIMIT`/`TOP`, window support, upsert syntax, JSON ops. `$ARGUMENTS` may state
the task and DB.

## 2. Write correctly

- Be explicit: name columns (no `SELECT *` in app code), qualify columns in
  joins, use explicit `JOIN ... ON` not comma joins.
- Mind NULL semantics (`= NULL` is never true; `NOT IN` + NULL pitfalls;
  `COALESCE`).
- Get `GROUP BY` / aggregate / `HAVING` right; understand
  `WHERE` vs `HAVING` and join-then-filter order.
- Use window functions for ranking/running totals instead of self-joins.
- **Always parameterize** values in application code — never string-concatenate
  user input (SQL injection). Show placeholders, not interpolated literals.

## 3. Optimize when needed

- Read the plan: `EXPLAIN [ANALYZE]`. Look for full scans on big tables,
  nested-loop joins over large sets, sorts/hashes spilling.
- Ensure indexes support the filter/join/sort columns; understand a composite
  index's leftmost-prefix rule; avoid functions on indexed columns in `WHERE`
  (non-sargable).
- Reduce rows early; avoid `SELECT *`; paginate with keyset pagination for large
  offsets; replace correlated subqueries with joins/CTEs where it helps.

## 4. Deliver

The query, a short explanation of what it does and why it's shaped that way,
assumptions about the schema, and (for optimization) before/after plan
reasoning. Recommend an index/migration separately rather than assuming it
exists.
