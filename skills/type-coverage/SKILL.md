---
name: type-coverage
description: Strengthen static typing — remove `any`/`unknown` escapes, tighten signatures, enable stricter compiler/checker settings incrementally. Use when asked to improve type safety or reduce type holes.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; static-typing best practice (no text reused)
---

# Type Coverage

Types are only useful where they're honest. Close the holes that let bugs
through; don't just silence the checker.

## 1. Measure the holes

Find where the type system is being defeated (`$ARGUMENTS` may scope a path):

- TS: `any`, `as` casts, `@ts-ignore`/`@ts-expect-error`, implicit any, `!`
  non-null assertions, untyped JSON/`Function`. `tsc --noEmit` with stricter
  flags to see what's hidden.
- Python: missing annotations, `Any`, `# type: ignore`, `cast()`. Run `mypy`/
  `pyright` in strict mode to surface them.
- Note: empty `tsc`/`mypy` output = success (exit code 0); don't misread silence
  as failure.

## 2. Fix the cause, not the symptom

- Replace `any` with the real type, a precise generic, or a discriminated
  union — not `unknown` + casts that re-hide it.
- Type at boundaries: validate/parse external data (zod/pydantic/`io-ts`) so the
  *internal* types are trustworthy instead of asserted.
- Remove a `@ts-ignore`/`type: ignore` by fixing the underlying mismatch; if
  it's a third-party gap, narrow the suppression to one line with a comment
  explaining why.
- Tighten signatures: no implicit any params, precise return types, `readonly`/
  `Final` where applicable, exhaustive switch with a `never` check.

## 3. Tighten settings incrementally

Enable stricter options one at a time (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`; mypy `--strict` piecemeal), fixing the fallout per
step rather than flipping everything and drowning. Per-file opt-in is fine for a
gradual migration.

## 4. Verify

The type checker passes with the stricter config and the test suite is still
green (a type change can be behaviorally wrong). Report: holes removed,
settings tightened, and any suppression you kept with its justification. Don't
weaken a type just to make the checker quiet.
