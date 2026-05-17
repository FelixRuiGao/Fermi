---
name: makefile
description: Write or fix a Makefile with correct phony targets, dependencies, and tab/variable rules, as a simple task runner or build graph. Use when asked to create a Makefile or debug make behavior.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; GNU make semantics (no text reused)
---

# Makefile

`make` is a dependency graph, not a script collection — but it's also the most
common cross-language task runner. Get the footguns right.

## 1. Clarify intent

Task runner (`make test`, `make lint`, `make build`) or a real build graph
(files produced from files)? `$ARGUMENTS` describes the goal. Read the project's
existing scripts (`package.json`, etc.) and reuse those commands.

## 2. Rules that bite (get these right)

- **Recipes are indented with a TAB**, never spaces. This is the single most
  common breakage — be explicit.
- **`.PHONY`**: declare every target that isn't a real file (`build test lint
  clean help`). Otherwise a file named `test` silently skips the target.
- Each recipe line runs in its **own shell** — chain with `&&` / `\` when steps
  depend on each other; use `.ONESHELL:` only deliberately.
- `$(VAR)` not `$VAR`; `:=` (immediate) vs `=` (recursive) — default to `:=`
  unless you need lazy. Escape a literal `$` as `$$`.
- Automatic vars (`$@`, `$<`, `$^`) for real file rules; add prerequisites so
  `make` rebuilds only what changed.
- `.DEFAULT_GOAL` or a `help` target as the first/default; fail loudly
  (`set -e` behavior is per-line — use `.SHELLFLAGS`/`&&`).

## 3. Conventions

- A self-documenting `help` target (the default) listing targets.
- Standard names: `all build test lint fmt clean install run`.
- Keep it minimal and portable (GNU make vs BSD make differences if it must run
  on macOS default make — note any GNU-isms).

## 4. Verify

Run the key targets (`make help`, `make <target> --dry-run` then for real).
Confirm `.PHONY` targets always run and tabs are tabs. Report the target list
and what each does.
