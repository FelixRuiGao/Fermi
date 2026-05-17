---
name: env-hygiene
description: Audit and fix environment-variable and configuration hygiene — .env handling, .env.example sync, validation at startup, no secrets in code or git. Use when reviewing config/env setup or onboarding pain.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; 12-factor config principles (public) — no text reused
---

# Env / Config Hygiene

Config bugs and leaked secrets both come from sloppy env handling. Tighten it.

## 1. Map the config surface

Find every place env is read (`process.env`, `os.environ`, `ENV[...]`,
`viper`/`dotenv`/`pydantic-settings`), the `.env*` files, and the deploy/CI
config. `$ARGUMENTS` may scope it.

## 2. Check and fix

- **Secrets out of git**: no real `.env` tracked
  (`git ls-files | grep -E '(^|/)\.env$'`), `.env` in `.gitignore`, no secrets
  hardcoded as fallbacks. If a secret is already committed → treat as a leak
  (rotate; see the `secrets-scan` skill).
- **`.env.example` in sync**: every variable the code reads has a documented
  entry with a placeholder (never a real value) and a comment. Onboarding should
  be "copy `.env.example` → `.env`, fill in".
- **Fail fast & typed**: validate required vars at startup with a clear error
  ("missing `DATABASE_URL`") instead of `undefined` blowing up deep in a request.
  Parse/coerce types and provide safe defaults only for non-secret, non-critical
  values. A schema (`zod`/`envalid`/`pydantic`) is the clean way.
- **No secrets in logs/errors**: don't print the env or tokens on crash.
- **Separation**: per-environment config, no prod credentials in dev defaults,
  least privilege.
- **Naming**: consistent prefix/UPPER_SNAKE; document units (`*_MS`,
  `*_BYTES`).

## 3. Deliver

A prioritized list (`secrets-in-git` first), the concrete fixes (gitignore
entry, `.env.example` diff, a startup validation block), and confirmation that
the app still boots with a correctly filled `.env`. Never print real secret
values; redact.
