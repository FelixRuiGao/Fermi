---
name: graphql
description: Design, extend, debug, or optimize a GraphQL schema, query, or resolver — types, nullability, pagination, N+1, errors. Use when working with a GraphQL API (schema/query/resolver) or diagnosing GraphQL issues.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; GraphQL specification (public) — no text reused
---

# GraphQL

GraphQL's footguns are different from REST: nullability, N+1, and over-broad
queries. Design and debug for those.

## 1. Ground in the existing schema

Read the SDL / type definitions and resolver map; match the project's
conventions (Relay vs offset pagination, error style, naming). `$ARGUMENTS` is
the task. Server framework matters (Apollo, graphql-js, gqlgen, Strawberry,
Hot Chocolate) for resolver/dataloader patterns.

## 2. Schema design

- **Nullability is a contract**: non-null (`!`) means "I guarantee a value or
  the whole field errors and can null its parent". Default to nullable for
  things that can fail; reserve `!` for true invariants. Over-using `!` makes
  one failure blank a big subtree.
- Model the domain, not the database; clear types over scalars; enums for
  closed sets; `input` types for mutations; consistent **pagination** (Relay
  connections or a documented offset pattern).
- Mutations return the affected entity + a typed payload (incl. user-facing
  errors as data, not just transport errors). Version by additive evolution +
  `@deprecated`, not `/v2`.

## 3. Resolvers & performance

- **N+1 is the #1 GraphQL bug**: a per-item resolver hitting the DB/service per
  node. Batch with **DataLoader** (or the framework's equivalent) — almost
  always required for list fields.
- Depth/complexity/cost limits + pagination to stop abusive/expensive queries.
- Resolve only requested fields; avoid over-fetching in resolvers.
- AuthZ per field/resolver, not just at the gateway (any field can be the entry
  point).

## 4. Debugging

- An error nulling a big chunk → trace the non-null field that threw; check the
  `errors[]` array + `path`.
- "Slow query" → log resolver timings; look for N+1 (missing dataloader),
  unbounded list, or a heavy nested resolver.
- Introspect the live schema and run the minimal failing query to isolate.

Deliver schema/query/resolver changes with the nullability + N+1 reasoning
stated, and verify against the running server (a query that the server rejects
isn't done).
