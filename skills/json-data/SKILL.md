---
name: json-data
description: Query, filter, reshape, validate, or construct JSON — API responses, config, logs, NDJSON — using jq or a small script. Use when the user wants to extract from, transform, or check the structure of JSON data.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; recommends jq (MIT, user tool); stdlib json fallback
---

# JSON Data

Reach for `jq` for query/transform; fall back to a tiny Python/`json` script for
logic jq makes awkward.

## 1. Understand the shape first

Don't write a blind filter against unknown JSON. Inspect:

```bash
jq 'if type=="array" then .[0] else . end | paths(scalars) | join(".")' file.json | sort -u | head
jq 'type, (if type=="array" then length else (keys_unsorted) end)' file.json
```

This reveals the structure (keys, array vs object, nesting) so the filter is
correct, not guessed. `$ARGUMENTS` is the file and/or goal. If `jq` isn't
installed, note it (`jq` is MIT; it's a user tool, invoked not bundled) and use
a Python `json` script instead.

## 2. Query / transform with jq

- Build the path incrementally (`.` → `.data` → `.data[].id`), checking output
  at each step.
- Common moves: `select(...)` filter, `map(...)`, `group_by`/`unique`,
  `to_entries`/`from_entries` for key remaps, `--arg` to pass shell values
  **safely** (never string-interpolate untrusted data into the program),
  `-r` for raw output, `@csv`/`@tsv` for tabular export.
- **NDJSON / streaming**: use `jq -c` per line or `--stream` for documents too
  big to hold in memory; don't slurp a multi-GB file.

## 3. When to use a script instead

Cross-record state, complex joins, schema validation, or generating JSON from
other data → a short Python script (`json` stdlib; `jsonschema` for validation
if present). Preserve key order where it matters; emit valid JSON (no trailing
commas, correct escaping/UTF-8).

## 4. Validate & verify

If a schema exists, validate against it (see the `json-schema` skill). Confirm
the output is well-formed (`jq empty out.json` exits 0). Report what was
extracted/changed and any records that didn't match the expected shape rather
than silently skipping them.
