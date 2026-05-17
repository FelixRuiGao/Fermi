---
name: lockfile
description: Diagnose and fix dependency lockfile problems — merge conflicts, drift from the manifest, integrity/hash failures, phantom or duplicate deps. Use when a lockfile conflicts, won't install, or is out of sync.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; package-manager lockfile semantics (no text reused)
---

# Lockfile Repair

A lockfile is generated state — never hand-merge or hand-edit it. Regenerate it
correctly with the package manager.

## 1. Identify the manager and the symptom

`package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`/`bun.lock`,
`poetry.lock`/`uv.lock`/`Pipfile.lock`, `Cargo.lock`, `go.sum`, `Gemfile.lock`,
`composer.lock`. Symptom from `$ARGUMENTS` / the error:

- **Merge conflict** in the lockfile.
- **Drift**: manifest changed but lockfile didn't (`npm ci`/`--frozen-lockfile`
  fails).
- **Integrity/hash mismatch**: `EINTEGRITY`, checksum failure.
- **Duplicates / phantom deps / wrong resolution**.

## 2. Fix by regenerating, not editing

- **Merge conflict**: do **not** resolve the conflict markers by hand. Take the
  manifest (`package.json` etc.) as the source of truth (resolve the conflict
  *there* if it also conflicts), delete/checkout the lockfile, and regenerate:
  `npm install` / `pnpm install` / `yarn` / `cargo generate-lockfile` /
  `poetry lock --no-update` / `bundle lock`. The lockfile is derived — let the
  tool produce it.
- **Drift**: run the manager's install (not `ci`) to reconcile, or
  `--lockfile-only` where supported; commit the updated lockfile.
- **Integrity mismatch**: clear the cache + reinstall; ensure the same registry;
  distrust a tampered/edited lockfile.
- Keep changes **minimal**: `poetry lock --no-update`, `npm install` without
  bumping unrelated deps — don't let "fix the lockfile" silently upgrade
  everything (that's a separate decision — see `dependency-upgrade`).

## 3. Use one manager, commit the lockfile

Mixing `npm` and `pnpm` in one repo produces lockfile chaos — use the one the
repo uses. The lockfile **must** be committed (it's what makes installs
reproducible); don't gitignore it for an app.

## 4. Verify

Clean install from scratch with the **frozen/CI** flag (`npm ci`,
`pnpm i --frozen-lockfile`, `poetry install --sync`, `cargo build --locked`) →
it must succeed with no further lockfile changes. Build + tests green. Report:
the cause, that you regenerated (not edited), and the net dependency delta
(ideally none beyond the intended change).
