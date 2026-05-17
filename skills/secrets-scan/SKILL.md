---
name: secrets-scan
description: Detect committed credentials, API keys, tokens, and private keys in the working tree or git history, and advise on safe remediation. Use when checking for leaked secrets or before making a repo public.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; common secret-pattern heuristics + optional gitleaks/trufflehog (their own licenses)
---

# Secrets Scan

Find credentials that should never be in the repo, and remediate safely.

## 1. Prefer a real scanner if available

```bash
command -v gitleaks && gitleaks detect --no-banner --redact
command -v trufflehog && trufflehog filesystem . --only-verified
```

If installed, these are far more reliable than grep. They have their own
licenses (gitleaks MIT, trufflehog AGPL) — they are the user's existing tools,
just invoked, not bundled. If neither exists, fall back to the heuristic pass
below and note it's best-effort.

## 2. Heuristic pass

Search the working tree (then `git log -p` / `git rev-list --all` if history
matters) for:

- High-entropy assignments to names like `*_KEY`, `*_SECRET`, `*_TOKEN`,
  `PASSWORD`, `PRIVATE_KEY`, `client_secret`.
- Provider-shaped tokens: `AKIA…` (AWS), `gh[pousr]_…` (GitHub),
  `xox[baprs]-…` (Slack), `sk-…` / `sk-ant-…` (LLM keys), `-----BEGIN … PRIVATE
  KEY-----`, Google `AIza…`, JWT `eyJ…`, `postgres://user:pass@…` connection
  strings.
- Tracked env files: `git ls-files | grep -E '(^|/)\.env'`.

Read each hit — exclude obvious false positives (test fixtures, public sample
keys, `.env.example` with placeholders), but if unsure, treat as a real leak.

## 3. Remediate (advise — these are sensitive, destructive steps)

For a confirmed leak, the priority order is:

1. **Rotate/revoke the credential** at the provider — assume it's compromised
   the moment it touched a remote. This is the only step that truly fixes it.
2. Remove it from the code; load from env/secret manager instead.
3. Add the path to `.gitignore`.
4. History rewrite (`git filter-repo` / BFG) only if needed and only with the
   user's explicit decision — it's destructive and rewrites shared history.

Report each finding as `file:line (or commit)`, type, and the remediation. Never
print full secret values back — redact the middle. Do not perform a history
rewrite or force-push automatically.
