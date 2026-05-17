---
name: api-docs
description: Generate accurate reference documentation for an API or library from its actual code/spec — endpoints or public functions, params, returns, errors, examples. Use when asked to document an API or produce API reference docs.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of doc workflows (no text reused)
---

# API Documentation

Reference docs must match the implementation exactly — wrong API docs are worse
than none.

## 1. Derive from the source of truth

- **HTTP API**: prefer an OpenAPI/Swagger spec if it exists; otherwise read the
  route definitions, handlers, request/response models, and middleware to learn
  the real contract. Consider generating from/with the spec
  (Redoc, `widdershins`, `openapi` tooling) rather than hand-maintaining.
- **Library/SDK**: read the public exports and their types; use the language's
  doc generator (`typedoc`, Sphinx, `cargo doc`, `godoc`, `pdoc`) when present —
  generated-from-code docs don't drift.

`$ARGUMENTS` scopes it (an endpoint group, a module).

## 2. Document each surface

For every endpoint/public function:

- Purpose (one line), auth/permissions required.
- Inputs: path/query/body params or arguments — type, required?, constraints,
  defaults, units.
- Output: success shape + status, with a realistic example.
- **Errors**: each failure mode, its status/exception, and what the caller
  should do.
- A minimal **working example** (request/response or code) — copy-pasteable.
- Versioning/deprecation and rate limits if applicable.

## 3. Organize for lookup

Group by resource/module, consistent ordering, stable anchors. Put a short
"getting started / auth" up top. Don't bury the common operations under
exhaustive edge cases.

## 4. Verify

Cross-check every documented param/field/error against the code — flag any
mismatch (often it reveals a real bug or an undocumented behavior; tell the
user). Run the doc generator if used and confirm it builds. Note anything you
could not determine from the code rather than inventing it.
