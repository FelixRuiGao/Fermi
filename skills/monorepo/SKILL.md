---
name: monorepo
description: Operate correctly inside a monorepo — find the right package, run scoped builds/tests, respect the workspace tool and dependency graph, and change only what's affected. Use when working in a multi-package repo.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; monorepo tooling practice (no text reused)
---

# Monorepo

In a monorepo the danger is doing too much globally or editing the wrong
package. Scope everything.

## 1. Identify the workspace tooling

Detect it before running anything:

- JS: pnpm/yarn/npm workspaces, **Nx**, **Turborepo**, Lerna, Rush
  (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`).
- Polyglot: **Bazel**, Pants, Buck, Gradle composite.
- Find the package map and the dependency graph. `$ARGUMENTS` may name the
  target package/task.

## 2. Locate the right package

Map the change to the owning package(s). Check which packages **depend on** the
one you're changing (the blast radius) — a change to a shared `packages/core`
affects every consumer; a leaf app change does not. Use the tool's graph
(`nx graph`, `pnpm why`, `bazel query`) rather than guessing.

## 3. Scope commands

- Run build/test/lint for the affected package(s) and their dependents, not the
  whole repo: `pnpm --filter <pkg>...`, `nx affected -t test`,
  `turbo run test --filter=<pkg>`, `bazel test //pkg/...`. Use the
  affected/changed selector so you verify what your change impacts without a
  30-minute full build.
- Respect internal package boundaries: import via the package's public entry,
  not deep relative paths into another package's internals. Add a dependency to
  that package's manifest if you introduce one — don't rely on hoisting.
- Honor the build cache (don't fight Turbo/Nx/Bazel caching; let it work).

## 4. Verify the blast radius

Build/test the changed package **and its dependents**. For a shared-package
change, that's the point — a green leaf isn't enough. Report: package(s)
touched, who depends on them, and the scoped commands you ran. Keep the change
within the package boundary unless the task is explicitly cross-cutting.
