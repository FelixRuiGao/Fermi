---
name: gitignore
description: Generate or fix a .gitignore tailored to the project's actual languages, tools, and OS, and stop already-tracked junk from being committed. Use when setting up or cleaning a repo's ignore rules.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; github/gitignore template categories (idea-level only)
---

# .gitignore

Ignore build output, dependencies, secrets, and machine cruft — keep source and
config tracked.

## 1. Detect what this repo actually is

Don't paste a generic megafile. Inspect the tree for the real stack: languages,
package managers (lockfiles tell you), frameworks, build tools, test/coverage
output, IDE/editor dirs, and OS (`.DS_Store`, `Thumbs.db`). `$ARGUMENTS` may add
specifics.

## 2. Compose tailored rules

Cover, only for what's present:

- **Dependencies/build**: `node_modules/`, `target/`, `dist/`, `build/`,
  `__pycache__/`, `*.pyc`, `.venv/`, `vendor/`, `bin/obj` — but **keep**
  lockfiles tracked (they're not ignorable artifacts).
- **Secrets/local**: `.env`, `.env.*` (but **not** `.env.example`), local
  credential/keystore files.
- **Test/coverage/caches**: `coverage/`, `.nyc_output/`, `.pytest_cache/`,
  `.mypy_cache/`, tool caches.
- **Editor/OS**: `.idea/`, `.vscode/` (consider tracking shared settings),
  `.DS_Store`, `*.swp`.
- Use precise patterns; prefer anchored (`/build/`) over broad (`build`) to
  avoid ignoring a real source dir; use `!` to re-include needed files
  (`!.env.example`). Order matters (last match wins).

## 3. Fix already-tracked files

`.gitignore` does **not** untrack files already in the index. If junk is already
committed, list it and remove from tracking (keeping it on disk):
`git rm -r --cached <path>` then commit — **only after showing the user** what
will be untracked (it's a visible change to the repo).

## 4. Verify

`git status --ignored` and `git check-ignore -v <path>` to confirm intended
files are ignored and no needed file got swept. Report the rules added and
anything untracked.
