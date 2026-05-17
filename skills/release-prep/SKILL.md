---
name: release-prep
description: Prepare a release — pick the next semantic version, finalize the changelog section, bump version files consistently, and create the tag. Use when cutting a release or bumping the version.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; SemVer 2.0.0 + Keep a Changelog conventions (no text reused)
---

# Release Preparation

Get the repo into a clean, taggable release state. **Do not push or publish**
unless the user explicitly asks — pushing tags and publishing are shared,
hard-to-reverse actions.

## 1. Find the current version and convention

```bash
git describe --tags --abbrev=0 2>/dev/null
ls package.json pyproject.toml Cargo.toml *.gemspec setup.py 2>/dev/null
```

Check `CONTRIBUTING.md` / `CLAUDE.md` / `AGENTS.md` for a project-specific release
procedure and **follow it over the generic steps here** if they differ (tag name
format, changelog handling, version-file list).

## 2. Decide the next version (SemVer)

From `$ARGUMENTS` if given (`1.4.0`, or `major`/`minor`/`patch`, or
`alpha`/`rc`). Otherwise infer from commits since the last tag:

- breaking change / `BREAKING CHANGE` → **major**
- new `feat` → **minor**
- only `fix`/`perf`/`chore` → **patch**
- Pre-1.0.0: a breaking change is typically a **minor** bump.

State the chosen version and the reasoning before changing files.

## 3. Apply the bump

- Move the changelog `## [Unreleased]` content into a new
  `## [X.Y.Z] - YYYY-MM-DD` section; add a fresh empty `## [Unreleased]` above
  it. (If the project's CLAUDE.md prescribes a different changelog ritual, do
  that instead.)
- Update the version in **every** file that carries it (package.json, lockfile
  if the tool requires it, pyproject/Cargo/etc.) — keep them consistent.
- Commit: `chore(release): vX.Y.Z` (or the repo's convention).
- Create an annotated tag matching the repo's exact tag format (often `vX.Y.Z`):
  `git tag -a vX.Y.Z -m "vX.Y.Z"`.

## 4. Hand back

Show the user the diff, the commit, the tag, and the **exact** push commands
(`git push && git push --tags`) — but let them run the push, or run it only on
explicit confirmation. Never `--force` to a shared branch.
