---
name: dockerfile
description: Write or optimize a production-grade Dockerfile — multi-stage, small, cached, non-root, reproducible. Use when asked to containerize a project or improve an existing Dockerfile.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Docker official best-practice principles (no text reused)
---

# Dockerfile

Produce an image that is small, builds fast on re-runs, and is safe to run.

## 1. Understand the app

Detect language/runtime, package manager, build step, runtime entrypoint, listen
port, and required env. Read existing `Dockerfile`/`.dockerignore`/compose files
first — improve, don't replace blindly. `$ARGUMENTS` may name the service/dir.

## 2. Apply these principles

- **Multi-stage**: a `build` stage with toolchains; a minimal final stage
  copying only artifacts. Final base as small as practical (`-slim`,
  `distroless`, `alpine` only if libc is fine).
- **Layer caching**: copy dependency manifests and install deps *before* copying
  source, so code changes don't bust the dependency layer
  (`COPY package*.json ./` → install → `COPY . .`).
- **Determinism**: pin a specific base tag (ideally by digest), use lockfile
  installs (`npm ci`, `pip install -r` with hashes, `go mod download`).
- **Non-root**: create and `USER` a non-root account; don't run as root.
- **Small surface**: no dev/test deps in the final image, clean package caches
  in the same layer, no secrets baked in (use build args/secrets, never `ENV`
  for credentials).
- **Runtime correctness**: explicit `WORKDIR`, `EXPOSE`, a sensible
  `HEALTHCHECK`, `CMD` in exec form, handle signals (PID 1 / `tini` if needed).
- Always write a matching `.dockerignore` (exclude `.git`, `node_modules`,
  build output, secrets) — it speeds builds and avoids leaking files.

## 3. Verify

If Docker is available, `docker build` it and check it boots. Report the final
image size and the caching strategy. Call out any base-image CVEs you'd watch.
Keep it minimal — don't add orchestration the user didn't ask for.
