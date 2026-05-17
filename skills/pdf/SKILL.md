---
name: pdf
description: Work with PDF files — extract text/tables, merge, split, rotate, encrypt/decrypt, read metadata, and OCR scanned pages. Use when the user wants to read, transform, combine, or extract data from a .pdf.
license: original (see skills/ATTRIBUTIONS.md)
source: original SKILL + original scripts/pdftool.py; uses pypdf (BSD-3), optional pdfplumber (MIT) / Pillow (HPND) / ocrmypdf (MPL-2.0, only if already installed)
---

# PDF

A bundled helper script handles the common structural operations; for anything
beyond it, write small Python against the same libraries.

## Requirements (preflight — do this first)

The libraries are **not** bundled; install on demand. Detect & install:

```bash
python3 - <<'PY'
import importlib, sys
need = [m for m in ("pypdf",) if importlib.util.find_spec(m) is None]
print("MISSING:", " ".join(need) if need else "none")
PY
# if MISSING is non-empty:
python3 -m pip install pypdf            # core (BSD-3)
python3 -m pip install pdfplumber       # better text/table extraction (MIT) — optional
```

Respect an active virtualenv if one is present. If `pip` is unavailable or the
user can't install, say so plainly — don't fake the output.

## Helper script

`scripts/pdftool.py` (resolve its path relative to this SKILL.md's directory)
covers the safe, common operations:

```bash
python3 <skill_dir>/scripts/pdftool.py info     in.pdf
python3 <skill_dir>/scripts/pdftool.py text     in.pdf --pages 1-3,5
python3 <skill_dir>/scripts/pdftool.py merge    -o out.pdf a.pdf b.pdf
python3 <skill_dir>/scripts/pdftool.py split    in.pdf --pages 2-4 -o sub.pdf
python3 <skill_dir>/scripts/pdftool.py rotate   in.pdf --deg 90 -o rot.pdf
python3 <skill_dir>/scripts/pdftool.py encrypt  in.pdf --password PW -o enc.pdf
python3 <skill_dir>/scripts/pdftool.py decrypt  in.pdf --password PW -o dec.pdf
```

Always run `info` first to learn page count before split/rotate.

## Beyond the helper

For tables, forms, layout-aware extraction, image extraction, or generating a
new PDF, write a short script using `pdfplumber` (tables/positioned text),
`pypdf` (forms/annotations), `Pillow` (page images), or `reportlab` (create).
Keep scripts small and print a clear summary of what changed.

## OCR (scanned PDFs)

If text extraction returns empty, the PDF is likely scanned images. If
`ocrmypdf` is **already installed** on the user's machine, use it
(`ocrmypdf in.pdf out.pdf`); do not require/install it (MPL-2.0). Otherwise tell
the user OCR needs that tool.

## Discipline

- Never overwrite the input — write to a new file; show a diff of metadata/page
  counts before/after.
- Treat password-protected or sensitive PDFs carefully; don't print secrets.
- Verify the result (`info` on the output) and report concretely. `$ARGUMENTS`
  is the file and/or operation.
