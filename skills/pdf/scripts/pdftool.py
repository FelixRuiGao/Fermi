#!/usr/bin/env python3
"""pdftool — original helper for the Fermi `pdf` skill.

Original code written for Fermi. Not derived from any third-party source. Calls
the pypdf library (BSD-3-Clause), which the user installs separately.

Subcommands:
  info     <in.pdf>                       page count + metadata
  text     <in.pdf> [--pages 1-3,5]       extract text (needs pdfplumber else pypdf)
  merge    -o out.pdf  a.pdf b.pdf ...     concatenate
  split    <in.pdf> --pages 1-3,7 -o out.pdf   keep a page subset
  rotate   <in.pdf> --deg 90 [--pages …] -o out.pdf
  encrypt  <in.pdf> --password PW -o out.pdf
  decrypt  <in.pdf> --password PW -o out.pdf

Exit codes: 0 ok · 2 bad usage · 3 missing dependency · 4 runtime error.
"""
from __future__ import annotations

import argparse
import sys


def _need(mod: str, pip_name: str | None = None):
    try:
        return __import__(mod)
    except ImportError:
        name = pip_name or mod
        sys.stderr.write(
            f"missing dependency: {name}\n"
            f"install it with:  python3 -m pip install {name}\n"
            f"(or inside the project's virtualenv if one is active)\n"
        )
        raise SystemExit(3)


def _parse_pages(spec: str, total: int) -> list[int]:
    """'1-3,5' (1-based, inclusive) -> [0,1,2,4] (0-based), clamped/validated."""
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            lo, hi = int(a), int(b)
        else:
            lo = hi = int(part)
        for p in range(lo, hi + 1):
            if not (1 <= p <= total):
                raise SystemExit(f"page {p} out of range (1..{total})")
            out.append(p - 1)
    if not out:
        raise SystemExit("no pages selected")
    return out


def cmd_info(a):
    pypdf = _need("pypdf")
    r = pypdf.PdfReader(a.input)
    print(f"pages: {len(r.pages)}")
    md = r.metadata or {}
    for k, v in md.items():
        print(f"{k}: {v}")
    print(f"encrypted: {r.is_encrypted}")


def cmd_text(a):
    try:
        pdfplumber = __import__("pdfplumber")
    except ImportError:
        pdfplumber = None
    if pdfplumber is not None:
        with pdfplumber.open(a.input) as pdf:
            total = len(pdf.pages)
            idx = _parse_pages(a.pages, total) if a.pages else range(total)
            for i in idx:
                print(pdf.pages[i].extract_text() or "")
        return
    # Fallback: pypdf's extractor (lower fidelity, no extra dep).
    pypdf = _need("pypdf")
    r = pypdf.PdfReader(a.input)
    total = len(r.pages)
    idx = _parse_pages(a.pages, total) if a.pages else range(total)
    for i in idx:
        print(r.pages[i].extract_text() or "")


def cmd_merge(a):
    pypdf = _need("pypdf")
    w = pypdf.PdfWriter()
    for f in a.inputs:
        for pg in pypdf.PdfReader(f).pages:
            w.add_page(pg)
    with open(a.output, "wb") as fh:
        w.write(fh)
    print(f"wrote {a.output} ({len(w.pages)} pages from {len(a.inputs)} files)")


def cmd_split(a):
    pypdf = _need("pypdf")
    r = pypdf.PdfReader(a.input)
    idx = _parse_pages(a.pages, len(r.pages))
    w = pypdf.PdfWriter()
    for i in idx:
        w.add_page(r.pages[i])
    with open(a.output, "wb") as fh:
        w.write(fh)
    print(f"wrote {a.output} ({len(idx)} pages)")


def cmd_rotate(a):
    pypdf = _need("pypdf")
    r = pypdf.PdfReader(a.input)
    total = len(r.pages)
    idx = set(_parse_pages(a.pages, total)) if a.pages else set(range(total))
    w = pypdf.PdfWriter()
    for i, pg in enumerate(r.pages):
        if i in idx:
            pg.rotate(a.deg)
        w.add_page(pg)
    with open(a.output, "wb") as fh:
        w.write(fh)
    print(f"wrote {a.output} (rotated {len(idx)} pages by {a.deg}°)")


def cmd_encrypt(a):
    pypdf = _need("pypdf")
    r = pypdf.PdfReader(a.input)
    w = pypdf.PdfWriter()
    for pg in r.pages:
        w.add_page(pg)
    w.encrypt(a.password)
    with open(a.output, "wb") as fh:
        w.write(fh)
    print(f"wrote encrypted {a.output}")


def cmd_decrypt(a):
    pypdf = _need("pypdf")
    r = pypdf.PdfReader(a.input)
    if r.is_encrypted:
        r.decrypt(a.password)
    w = pypdf.PdfWriter()
    for pg in r.pages:
        w.add_page(pg)
    with open(a.output, "wb") as fh:
        w.write(fh)
    print(f"wrote decrypted {a.output}")


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="pdftool", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("info"); s.add_argument("input"); s.set_defaults(fn=cmd_info)
    s = sub.add_parser("text"); s.add_argument("input"); s.add_argument("--pages"); s.set_defaults(fn=cmd_text)
    s = sub.add_parser("merge"); s.add_argument("inputs", nargs="+"); s.add_argument("-o", "--output", required=True); s.set_defaults(fn=cmd_merge)
    s = sub.add_parser("split"); s.add_argument("input"); s.add_argument("--pages", required=True); s.add_argument("-o", "--output", required=True); s.set_defaults(fn=cmd_split)
    s = sub.add_parser("rotate"); s.add_argument("input"); s.add_argument("--deg", type=int, required=True); s.add_argument("--pages"); s.add_argument("-o", "--output", required=True); s.set_defaults(fn=cmd_rotate)
    s = sub.add_parser("encrypt"); s.add_argument("input"); s.add_argument("--password", required=True); s.add_argument("-o", "--output", required=True); s.set_defaults(fn=cmd_encrypt)
    s = sub.add_parser("decrypt"); s.add_argument("input"); s.add_argument("--password", required=True); s.add_argument("-o", "--output", required=True); s.set_defaults(fn=cmd_decrypt)

    a = p.parse_args(argv)
    try:
        a.fn(a)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — surface a clean message, not a traceback
        sys.stderr.write(f"error: {e}\n")
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
