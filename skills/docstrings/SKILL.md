---
name: docstrings
description: Add or standardize docstrings / API doc comments in the project's idiomatic format (JSDoc/TSDoc, Google/NumPy, rustdoc, godoc, etc.), documenting contracts not restating code. Use when asked to document functions or add docstrings.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; language docstring conventions (public) — no text reused
---

# Docstrings

Document the **contract**, not the syntax. A docstring that restates the code is
noise that rots.

## 1. Detect the convention

Match what the project already uses: TSDoc/JSDoc, Python Google or NumPy or
reStructuredText style, Javadoc, rustdoc (`///`), godoc (sentence-style above
the symbol), KDoc. Read existing well-documented symbols and copy that exact
format and tone. `$ARGUMENTS` scopes the target (file/module/public API).

## 2. Document what the caller can't see from the signature

For each public/exported symbol:

- One-line summary of what it does (imperative, ends with a period).
- **Parameters**: meaning, units, valid range, ownership — not just the type
  (the type is already in the signature).
- **Returns**: what it means, special values, empty/None cases.
- **Raises/Throws/Errors**: every error condition a caller must handle.
- **Side effects**: mutation, I/O, global/state changes, blocking, thread/async
  safety.
- Non-obvious **preconditions/invariants**, complexity if relevant, and a short
  usage example for non-trivial APIs.

## 3. Restraint

- Prioritize public API and non-obvious internals. Don't paper every trivial
  private getter with boilerplate.
- Don't write `@param x the x` — if there's nothing non-obvious to say, the type
  + good name is enough.
- Keep docstrings true to the code; if the code's behavior is unclear, that's a
  signal to fix naming/structure, not to over-explain.

## 4. Verify

If the project has a doc linter/builder (`pydocstyle`, `tsdoc`, `cargo doc`,
`godoc`), run it and ensure it's clean and the docs render. Report symbols
documented and any place where the code's behavior was too unclear to document
honestly (flag for the user).
