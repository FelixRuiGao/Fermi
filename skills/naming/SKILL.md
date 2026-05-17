---
name: naming
description: Improve names of variables, functions, types, files, and APIs for clarity and consistency, applied safely repo-wide. Use when names are unclear, misleading, inconsistent, or asked to "rename for readability".
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; naming principles (no text reused)
---

# Naming

Good names are the cheapest documentation. A misleading name is a latent bug.

## 1. Find the offenders

In scope (`$ARGUMENTS` / a file / the diff), flag names that are: vague
(`data`, `tmp`, `handle`, `doStuff`, `manager`), **misleading** (says one thing,
does another — the worst kind), abbreviated cryptically, inconsistent with
synonyms for the same concept (`user`/`account`/`usr`), mismatched to
convention (casing, boolean not `is/has`-prefixed, function not a verb), or
leaking implementation into the name.

## 2. Choose better names

- Reveal **intent and units**: `retryCount`, `timeoutMs`, `isEligible`,
  `userById` — not `n`, `flag`, `tmp`.
- Match the domain vocabulary already used in the codebase; one term per
  concept, used everywhere.
- Length ∝ scope: a 2-line loop index `i` is fine; a module-level export is
  not. Functions = verb phrases; booleans = predicates; collections = plural.
- Follow the language/project convention exactly (snake/camel/Pascal,
  file naming).
- Don't encode the type in the name (no Hungarian) when the type system already
  says it.

## 3. Apply safely (this is a refactor)

Renaming is a behavior-preserving refactor — use the safe method:

- Prefer an **LSP/IDE rename** or AST tool (`ts-morph`, `gopls`, rope) over
  text find/replace, so you don't rename an unrelated same-named symbol or break
  strings/comments (see `codemod`).
- Mind dynamic references: serialized field names, API/JSON keys, DB columns,
  config keys, reflection, public API consumed externally — renaming these is a
  **breaking change**, not cosmetic; flag rather than silently break.
- Keep the rename isolated from logic changes.

## 4. Verify

Typecheck, lint, full test suite, build. Grep the old name → zero unintended
remnants (explain any intentional ones, e.g. an external API alias kept for
compat). Report names changed and any rename you held back as breaking/risky.
