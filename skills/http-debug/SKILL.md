---
name: http-debug
description: Diagnose a failing or misbehaving HTTP request — status, headers, auth, CORS, redirects, TLS, encoding, timeouts. Use when an API call, fetch, or webhook isn't working as expected.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; HTTP semantics (RFC 9110 family, public) — no text reused
---

# HTTP Debugging

Reproduce the request in isolation, then read what the wire actually says.

## 1. Reproduce with curl

Take it out of the app. Build the exact request and look at the full exchange:

```bash
curl -sS -i -X <METHOD> '<url>' -H '...' --data '...'    # response + headers
curl -sS -v 'https://host/path' 2>&1 | sed -n '1,40p'    # request line, TLS, redirects
```

`$ARGUMENTS` describes the failing call. Redact secrets when echoing headers.

## 2. Read the signal, top down

- **Status**: 3xx (follow `Location`; is the method preserved? 307/308 vs 301/
  302) · 401 vs 403 (unauthenticated vs unauthorized) · 404 (wrong path/base
  URL) · 405 (wrong method) · 415 (Content-Type) · 422 (validation) · 429
  (rate-limit — check `Retry-After`) · 5xx (server; check its logs).
- **Headers**: `Content-Type` vs what you sent/expect, `Authorization` actually
  present and well-formed, `Accept`, `Content-Length`/chunked, caching, cookies.
- **Auth**: token expiry, scheme (Bearer vs Basic vs API key header), clock skew
  for signed/JWT, audience/issuer.
- **CORS** (browser only): it's enforced by the browser, not curl — a curl that
  works but a browser that fails ⇒ missing
  `Access-Control-Allow-Origin`/preflight (`OPTIONS`) handling on the server.
- **TLS**: cert chain/hostname/expiry (`curl -v` shows the handshake);
  corporate proxy/MITM.
- **Body/encoding**: gzip, charset, JSON vs form vs multipart mismatch, trailing
  data.
- **Timeouts/connection**: DNS, wrong host/port, connection reset, keep-alive,
  proxy env vars (`HTTP(S)_PROXY`/`NO_PROXY`).

## 3. Isolate the variable

Change one thing at a time (drop auth, simplify body, hit a known-good
endpoint, try HTTP/1.1, bypass the proxy) to localize the cause to client,
network, or server.

## 4. Report

State the root cause, the minimal fix (client code, header, server config), and
the exact corrected request. Confirm with a clean repro.
