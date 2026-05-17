---
name: csv-data
description: Clean, transform, convert, join, profile, or summarize tabular data (CSV/TSV/JSON-lines) reliably. Use when the user wants to wrangle a data file, fix a messy CSV, or convert between tabular formats.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; stdlib csv by default, optional pandas (BSD-3) for scale
---

# Tabular Data Wrangling

Data tasks fail silently — wrong delimiter, mojibake, IDs turned into floats,
rows dropped. Be deliberate and always report row/column counts in and out.

## 1. Profile first — never transform blind

Detect: delimiter, quoting, encoding (UTF-8 vs Latin-1/BOM), header presence,
row count, per-column type, and missing/blank/duplicate counts. Print this
summary before any change. `$ARGUMENTS` is the file and/or the goal.

## 2. Pick the tool

- **Python stdlib `csv`** — default; zero dependency, correct quoting, fine up
  to large files when streamed. Always `newline=""` and an explicit `encoding`.
- **pandas** (preflight: `python3 -c "import pandas" || pip install pandas`) —
  for joins, group/aggregate, type coercion, pivots, big transforms. Optional,
  not bundled.
- For huge files, stream row-by-row rather than loading everything.

## 3. Clean carefully

- Fix encoding explicitly; normalize line endings.
- Coerce dtypes intentionally — keep IDs/zip codes/phone numbers as **strings**
  (don't let `00123` become `123`); parse dates with a known format, don't guess
  per-row.
- Trim/normalize whitespace and case only where it's a real key; don't mangle
  free text.
- Handle missing values by an explicit decision (fill / drop / flag) and
  **report how many** were affected — never drop rows silently.
- Deduplicate on a stated key; report how many were removed.

## 4. Convert / output

CSV↔TSV↔JSON(L)↔Parquet/Excel as asked. Quote correctly, keep a stable column
order, preserve types through the round trip. Write to a **new** file; never
overwrite the source without confirmation.

## 5. Verify

Re-profile the output. Report: rows in → out, columns, what was changed/dropped
and why. If a transformation is lossy, say so explicitly before finalizing.
