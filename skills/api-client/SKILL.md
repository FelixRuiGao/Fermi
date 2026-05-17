---
name: api-client
description: Generate a typed, ergonomic client for an HTTP/REST API from an OpenAPI/Swagger spec or example responses, matching the project's stack and conventions. Use when asked to build an API client or SDK wrapper.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# API Client

A client the rest of the codebase will actually enjoy calling — typed, safe,
testable.

## 1. Get the contract

Best → worst source: an **OpenAPI/Swagger** spec, API reference docs, then
example requests/responses. `$ARGUMENTS` may give a spec path/URL. If a spec
exists, consider whether an established generator
(`openapi-typescript`, `openapi-generator`, `oapi-codegen`, `datamodel-code-
generator`) is the right call — generated + thin hand-written ergonomics often
beats a fully hand-rolled client. Recommend it; don't force a bespoke client.

## 2. Match the project

Detect the HTTP library already in use (fetch/axios/httpx/reqwest/net-http) and
the language's typing conventions. The new client must look native to the repo.

## 3. Design it well

- **Types** for every request and response body; model error responses too.
- One configurable place for **base URL, auth, default headers, timeouts**.
- **Auth** handled centrally (token injection, refresh) — never per call site.
- **Errors**: distinguish transport errors, non-2xx responses (typed by status),
  and validation; throw/return something the caller can branch on — don't return
  `any`.
- **Resilience**: sane timeout; retry only idempotent requests with backoff +
  jitter; respect `Retry-After`; make retries opt-in/configurable.
- **Cancellation** support (AbortSignal/context).
- Pagination as an iterator/stream helper if the API paginates.
- No secrets hardcoded; read from config/env.

## 4. Verify

Provide a usage example and unit tests with the HTTP layer mocked (success,
4xx, 5xx, timeout, pagination). Typecheck it. Keep the surface to what's needed
now — don't generate the entire API if the user wants three endpoints.
