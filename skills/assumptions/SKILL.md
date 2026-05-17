---
name: assumptions
description: Before implementing, surface the implicit assumptions, ambiguities, and unknowns in a request and resolve them — by checking the code or asking — instead of guessing. Use at the start of a non-trivial or ambiguous task.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; requirements-clarification discipline (no text reused)
---

# Surface Assumptions

The most expensive bugs are built confidently on a wrong assumption. Make the
assumptions explicit *first*.

## 1. Extract the implicit

For the request (`$ARGUMENTS` / the conversation), list what you'd have to
*assume* to start coding:

- **Behavioral**: exact expected output, edge cases, error handling the request
  didn't specify.
- **Scope**: what's included vs. deliberately not; how far the change reaches.
- **Environment**: versions, platforms, data shape/size, existing
  patterns/constraints to follow.
- **Intent**: the underlying goal — sometimes the literal ask isn't the best
  solution to the actual problem.
- **Interface/contract**: inputs/outputs, compat requirements, who else depends
  on this.

## 2. Resolve, don't guess

For each assumption, classify:

- **Answerable from the code/repo** → go check it (read the code, tests, docs,
  git history) and state what you found. This is the preferred resolution.
- **A genuine product/scope decision** → ask the user a specific, concise
  question. Don't ask what you can find yourself; don't bury them in trivia.
- **Low-risk, reasonable default** → state the assumption explicitly and
  proceed ("Assuming X since Y; tell me if not").

Never silently invent intent or rationale the user didn't express — if the
*why* matters and is unknown, ask. A stated assumption is recoverable; a hidden
one is a latent bug.

## 3. Output

A short list: "Verified from code: …", "Assuming (low-risk): …", "Need your
call: …". Then proceed on the verified + low-risk items and block only on the
genuine decisions. Keep it proportional — a trivial task needs one line, not an
interrogation. The goal is to start implementation on solid ground, not to
stall.
