---
name: changelog
description: Add or update a Keep a Changelog entry from recent changes. Use when asked to update the changelog, record user-facing changes, or maintain CHANGELOG.md.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; follows the public "Keep a Changelog" 1.1.0 convention (no text reused)
---

# Changelog

Maintain a human-facing changelog. Record what *users* notice, not internal churn.

## 1. Find the existing convention first

```bash
ls CHANGELOG* HISTORY* 2>/dev/null
```

- If a `CHANGELOG.md` exists, **match its existing format exactly** (heading
  style, section names, date format, links).
- Check `CONTRIBUTING.md`, `CLAUDE.md`, or `AGENTS.md` for a project-specific
  changelog/release rule and follow it over the generic convention below if they
  conflict.
- If none exists and the user wants one, create it using *Keep a Changelog*:

```markdown
# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
```

## 2. Derive entries

```bash
git log --no-merges --oneline <last-tag>..HEAD   # or a sensible recent range
git diff <last-tag>..HEAD --stat
```

Translate commits into user-facing language:

- `feat:` → **Added** / **Changed**
- `fix:` → **Fixed**
- removed flag/API → **Removed** / **Deprecated**
- security fix → **Security**
- Pure refactors, test-only, and internal chores → usually **omit**.

## 3. Write

- One bullet per change, present tense, user's vocabulary not the code's.
- Put new entries under `## [Unreleased]`; do not invent a version/date unless
  cutting a release (use the `release-prep` skill for that).
- Don't duplicate an entry that's already there; merge instead.
- Link issues/PRs only if the project's changelog already does.

`$ARGUMENTS` may name a version, a commit range, or a single change to add.
