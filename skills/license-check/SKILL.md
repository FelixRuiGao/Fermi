---
name: license-check
description: Audit dependency licenses for compatibility with the project's own license and flag risky (copyleft / no-license / unknown) dependencies. Use when checking license compliance or before shipping/open-sourcing.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; SPDX license taxonomy (public) — no text reused
---

# License Check

Find dependency licenses that are incompatible with how the project ships, so
the user can decide before it becomes a legal problem.

## 1. Determine the project's own license and distribution model

Read `LICENSE`/`package.json`/`pyproject.toml`. Compatibility depends on both
the license **and** how the code is distributed (a SaaS backend vs. a shipped
binary/library vs. an internal tool have very different copyleft exposure).

## 2. Enumerate dependency licenses with real tooling

- **npm**: `npx license-checker --summary` / `--json`
- **Python**: `pip-licenses --format=json` (pip install pip-licenses)
- **Rust**: `cargo deny check licenses` or `cargo license`
- **Go**: `go-licenses report ./...`
- Cross: `scancode` if available for source-level scanning.

These are the user's tools, invoked transiently, under their own licenses. If
none is installed, recommend one and do a best-effort manual pass from lockfile
metadata, clearly marked as incomplete.

## 3. Classify and flag

- **Permissive** (MIT, Apache-2.0, BSD, ISC, Zlib, Unlicense) — generally safe;
  Apache-2.0/BSD still require preserving NOTICE/attribution.
- **Weak copyleft** (MPL-2.0, LGPL, EPL) — usually OK if the dependency is not
  modified and is dynamically linked; flag for review.
- **Strong copyleft** (GPL-2.0/3.0, AGPL-3.0) — high risk for proprietary or
  binary distribution, AGPL even for network use. Flag prominently.
- **No license / unknown / custom / "all rights reserved"** — treat as
  **do not use** until clarified. Absence of a license means no grant of rights.
- **CC-BY / CC0** for data/docs — note attribution needs; CC-BY-NC/ND is not
  OSS-compatible.

`$ARGUMENTS` may scope to one package. Output: a table (package → license →
risk → why), the must-fix items first, and concrete remediation (replace the
dep, isolate it, get a commercial license, or add required attribution). This is
guidance, not legal advice — say so.
