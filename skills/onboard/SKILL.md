---
name: onboard
description: Analyze an unfamiliar codebase and produce a concise onboarding guide — architecture, key directories, build/test/run, conventions, where to start. Use when joining a new repo or asked for a codebase overview.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of agent codebase-init workflows (no text reused)
---

# Codebase Onboarding

Produce the document you'd want when dropped into this repo cold — accurate,
navigational, and short enough to actually read.

## 1. Survey systematically

Don't guess from the README — read the repo:

- **Shape**: top-level layout, the package manifest(s), entrypoints, monorepo?
- **Stack**: languages, frameworks, build tool, package manager, datastore.
- **Run/build/test**: the real commands (from scripts/CI/Makefile), how to run
  locally, env/config needed.
- **Architecture**: the main modules and how they depend on each other; the
  primary data/control flow (trace one real request/operation end to end).
- **Conventions**: testing approach, error handling, naming, lint/format,
  branching/commit style, existing `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING`.
- **Entry points for a newcomer**: where the core logic lives vs. glue;
  where to make a typical change.

For a large codebase, fan out the survey (the `Explore`/sub-agent approach) so
breadth doesn't blow the context — then synthesize.

## 2. Write the guide

Concise, navigational, link to real paths (`src/foo/bar.ts`):

1. One-paragraph "what this project is".
2. Architecture overview (a small diagram helps — see the `mermaid` skill).
3. Directory map: what lives where, what to ignore.
4. Build / test / run — exact commands.
5. Conventions & gotchas a newcomer will hit.
6. "Where to start" for common tasks.

## 3. Persist it (Fermi-aware)

Offer to save it where it stays useful: a `docs/` overview, or — for facts that
should steer future Fermi sessions in this repo — the project's `AGENTS.md`
(Fermi's persistent project memory; a global one also lives at
`~/.fermi/AGENTS.md`). Keep `AGENTS.md` tight: durable facts and conventions,
not a full tutorial. Confirm with the user before writing to `AGENTS.md` since
it shapes every future turn. State anything you couldn't determine instead of
guessing.
