---
name: adr
description: Write an Architecture Decision Record capturing a technical decision, its context, the options considered, and consequences. Use when documenting or proposing a significant architectural/technical decision.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Nygard-style ADR concept (idea-level only)
---

# Architecture Decision Record

An ADR captures *why* a decision was made so future maintainers don't relitigate
it or undo it blindly.

## 1. Fit the project's convention

Look for an existing `docs/adr/`, `doc/decisions/`, or `architecture/` directory
and **match its template, numbering, and filename scheme**
(`NNNN-title.md`). If none exists and the user wants ADRs, create
`docs/adr/0001-...md` and a short index. `$ARGUMENTS` is the decision/topic.

## 2. Capture the decision honestly

Sections:

- **Title** — the decision, short and specific (`Use Postgres for the event
  store`).
- **Status** — Proposed / Accepted / Deprecated / Superseded by ADR-XXXX.
- **Context** — the forces: requirements, constraints, problem, what's true
  *now* that makes this a decision. No solution here.
- **Decision** — what was chosen, stated in active voice ("We will …").
- **Options considered** — the real alternatives, each with honest pros/cons and
  why it lost. An ADR with only the winning option is propaganda, not a record.
- **Consequences** — what becomes easier, what becomes harder, new risks,
  follow-up work, what this commits the team to.

## 3. Quality bar

- Write down the *real* reasoning, including tradeoffs the team accepted — not a
  retroactive justification. Do not invent rationale; if the "why" is unknown,
  ask the user rather than fabricating it.
- One decision per ADR. Keep it to a page; link out for detail.
- ADRs are immutable history: don't rewrite an accepted one — supersede it with
  a new ADR and update the old one's status.

Deliver the file in the project's location/format and update the ADR index if
one exists.
