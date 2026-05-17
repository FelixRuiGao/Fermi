---
name: security-audit
description: Review code changes for security vulnerabilities (injection, authz, secrets, unsafe input handling, etc.) and report findings by severity with concrete fixes. Use when asked for a security review of code or a diff.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; OWASP Top 10 categories (public taxonomy) — no text reused
---

# Security Audit

A defensive review of changed code. Goal: find real, exploitable weaknesses and
fix them — not a generic checklist recital.

## 1. Scope

Default to the change under review: `git diff <base>...HEAD` (plus uncommitted).
`$ARGUMENTS` may target a path or PR. Read changed code with its callers and
trust boundaries — a vulnerability is about how untrusted data reaches a sink.

## 2. Check, concretely, against the code

- **Injection** — untrusted input concatenated into SQL, shell/`exec`, file
  paths, OS commands, template engines, `eval`, deserialization, LDAP, regex
  (ReDoS). Trace input → sink.
- **AuthZ / AuthN** — missing or wrong access checks, IDOR (object reference
  without ownership check), privilege escalation, auth bypass, trusting
  client-supplied identity/role.
- **Secrets** — hardcoded keys/tokens/passwords, secrets in logs or error
  messages, secrets committed to the repo (pair with the `secrets-scan` skill).
- **Input validation / output encoding** — XSS (missing output encoding), SSRF
  (server fetching a user-controlled URL), path traversal, open redirect,
  unsafe file upload, mass assignment.
- **Crypto** — weak/MD5/SHA1 for passwords, ECB, hardcoded IV, predictable
  randomness for security, missing TLS verification.
- **Data exposure** — over-broad API responses, PII in logs, verbose errors
  leaking internals, missing rate limiting on sensitive endpoints.
- **Dependencies/config** — known-vulnerable deps, dangerous defaults, debug
  mode in prod, permissive CORS, missing security headers.

## 3. Report

Per finding: severity (**Critical/High/Medium/Low**), `file:line`, the
vulnerability class, a brief realistic exploit scenario, and a concrete fix
(parameterized query, allowlist, proper authz check, etc.). Prioritize
exploitable issues over theoretical ones; note your confidence. Recommend, don't
auto-apply, fixes to security-sensitive code unless the user asks. This is
strictly a defensive audit of the user's own codebase.
