---
name: json-schema
description: Author, infer, or validate a JSON Schema (correct draft, constraints, $ref reuse) and wire up validation. Use when asked to write a schema, validate JSON/config, or generate types from a schema.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; JSON Schema specification (public) — no text reused
---

# JSON Schema

A schema that actually rejects bad data and stays maintainable.

## 1. Pin the draft and target

JSON Schema drafts differ (draft-07 vs 2019-09 vs 2020-12: `$defs` vs
`definitions`, `dependentSchemas`, tuple `prefixItems`). Use the draft the
project's validator supports (`ajv`, `jsonschema`, `quicktype`, OpenAPI's
dialect). Declare `$schema`. `$ARGUMENTS` may be a sample JSON or a description.

## 2. Build it

- Infer the base shape from real samples, then **tighten** beyond what inference
  gives: `type`, `required`, `enum`, `format`, `minimum/maximum`,
  `minLength/pattern`, `minItems/uniqueItems`.
- `"additionalProperties": false` for closed objects (catches typos in
  config) — only leave open when extensibility is intended.
- Factor repeated shapes into `$defs` and reference with `$ref`; don't copy-
  paste sub-schemas.
- Use `oneOf`/`anyOf` + discriminator for unions; `if/then/else` or
  `dependentRequired` for conditional requirements.
- Add `title`/`description`/`examples` — the schema doubles as documentation and
  feeds form/codegen.

## 3. Validate and wire up

- Test the schema against valid **and** deliberately invalid samples; confirm
  it rejects what it should (an over-permissive schema is the usual failure).
- Hook validation in at the boundary (config load, API request) with the
  project's validator, returning useful error paths.
- Optionally generate types (`json-schema-to-typescript`,
  `datamodel-code-generator`) so code and schema stay in sync.

Deliver the schema, the draft used, the validation wiring, and the pass/fail
sample matrix.
