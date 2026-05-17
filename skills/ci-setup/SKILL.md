---
name: ci-setup
description: Generate or improve a CI pipeline (GitHub Actions, GitLab CI, etc.) that installs, lints, type-checks, tests, and builds the project with caching. Use when setting up or fixing CI/CD configuration.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# CI Setup

A pipeline that mirrors what a developer runs locally, fast and reproducible.

## 1. Learn the project

Detect language(s), package manager, and the real local commands for: install,
lint, format-check, typecheck, test (with coverage), build. Read existing CI
config and `package.json`/`Makefile`/`justfile` scripts — reuse the project's
actual commands rather than inventing them. `$ARGUMENTS` may name the platform.

## 2. Pick the platform

Default to **GitHub Actions** (`.github/workflows/ci.yml`) unless the repo
clearly uses GitLab CI, CircleCI, etc. Match what's already there.

## 3. Build the pipeline

- **Triggers**: push to default branch + pull_request. Add `workflow_dispatch`.
- **Concurrency**: cancel superseded runs for the same ref.
- **Jobs**: a `lint`/`typecheck` job and a `test` job; a `build` job if it
  ships artifacts. Use a matrix only if the project supports multiple
  versions/OSes.
- **Steps**: checkout → set up runtime (pinned version) → restore dependency
  cache → install (locked) → run the exact local commands → upload coverage/
  artifacts.
- **Caching**: cache the dependency store keyed by the lockfile hash — this is
  the single biggest CI speedup.
- **Pinning & permissions**: pin action versions; set least-privilege
  `permissions:` (default read-only, elevate per job only as needed). Never put
  secrets in the YAML; reference repository secrets.

## 4. Verify

Validate YAML syntax. Confirm every command exists and passes locally first
(a CI file that references a missing script is the most common failure). Keep it
minimal — no deploy/release stages unless asked. Report what each job does and
the caching key.
