---
name: openapi
description: Author, extend, lint, or derive an OpenAPI/Swagger specification that accurately describes an HTTP API. Use when writing or fixing an OpenAPI spec, or documenting an API as a spec.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; OpenAPI Specification (public) — no text reused
---

# OpenAPI Spec

The spec must match the real API exactly — it drives clients, docs, and mocks,
so a wrong spec propagates everywhere.

## 1. Ground it in reality

If the API exists, derive the spec from the actual routes/handlers/models — read
them; don't describe an idealized API. If a spec exists, extend it consistently.
Pick the OpenAPI version the toolchain uses (3.0 vs 3.1 — 3.1 is JSON-Schema
2020-12 aligned, nullable handling differs). `$ARGUMENTS` scopes it.

## 2. Build it well

- **`components/schemas`** for every model; `$ref` them — never inline-duplicate
  a schema. Reuse `parameters`, `responses`, `securitySchemes`.
- Each operation: stable `operationId` (codegen uses it), `summary`, `tags`,
  typed parameters (path/query/header) with `required` and constraints, typed
  request body, and **all** realistic responses including 4xx/5xx with an error
  schema.
- Model auth via `securitySchemes` + `security`.
- Concrete `examples` on schemas/requests/responses — they power docs and mock
  servers.
- Be precise with types/formats (`integer`/`int64`, `string`/`date-time`,
  `enum`), `nullable` vs optional, and pagination conventions.

## 3. Lint and validate

Validate with a real linter — don't eyeball YAML:

```bash
npx @redocly/cli lint openapi.yaml      # or spectral lint
```

Fix structural errors and style warnings. Confirm `$ref`s resolve and examples
conform to their schemas.

## 4. Verify against the implementation

Cross-check paths, methods, status codes, and field names against the actual
code. Report any mismatch — it usually means the spec is wrong *or* the API has
an undocumented behavior; surface it rather than smoothing it over. Optionally
generate a client/mock to sanity-check the spec is usable.
