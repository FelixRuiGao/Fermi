---
name: devcontainer
description: Create or fix a reproducible dev environment (Dev Containers / docker-compose) so the project builds and runs identically for everyone. Use for onboarding pain or "works on my machine" issues.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Dev Containers spec concepts (public) — no text reused
---

# Dev Environment / Devcontainer

The goal: clone → open → everything works, the same for everyone and for CI.

## 1. Learn what the project actually needs

Inspect the real toolchain: language runtimes + exact versions, package
managers, system libs, services it depends on (DB, cache, queue), env vars,
build/test/run commands. Read existing setup docs, CI config (CI is a de-facto
environment spec), and any current `.devcontainer`/compose. `$ARGUMENTS` may
scope it. Don't guess versions — pin to what the project uses.

## 2. Build the environment

Prefer the **Dev Containers** standard (`.devcontainer/devcontainer.json`) when
appropriate, or a `docker-compose` dev setup, matching the repo's approach:

- **Pinned** base image and tool versions (reproducibility is the whole point);
  use Features/known layers over ad-hoc installs.
- Dependent services as compose services (DB/cache) with healthchecks; seed
  data via a script (see `mock-data`), never real data.
- `postCreateCommand` to install deps and prepare the workspace so first-open
  just works.
- Sensible defaults: non-root user, volume mounts for caches, forwarded ports,
  recommended editor extensions/settings.
- Secrets via env/`.env` (gitignored) and `.env.example` (see `env-hygiene`) —
  never baked into the image or committed.
- Keep it lean; reuse the production `Dockerfile` build stages where it makes
  sense (see `dockerfile`) so dev ≈ prod.

## 3. Verify it actually works from zero

The only real test is a cold start: build the container/environment fresh and
run install → build → test → run inside it. "It should work" is not
verification. Confirm dependent services come up and the app can reach them.

## 4. Deliver

The config + a short "how to use" note (and what it deliberately doesn't cover).
Report what you verified by actually running it, and any step that still needs
host-side setup. Keep parity with CI so green locally means green in CI.
