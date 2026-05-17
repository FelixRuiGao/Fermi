---
name: commit
description: Create a well-formed Conventional Commit from staged changes — inspect the diff, infer type/scope, write a concise message, and commit. Use when the user asks to commit, "commit this", or wants a good commit message.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Conventional Commits 1.0.0 spec + capability-level survey of coding agents (no text reused)
---

# Conventional Commit

Produce one clean, intentional commit. Do not commit unless the user asked you to.

## 1. Inspect

Run in parallel:

- `git status --short` — what is staged vs unstaged vs untracked.
- `git diff --staged` — the exact change to be committed.
- `git log --oneline -15` — match this repo's existing message style (prefix
  casing, scope conventions, language).

If **nothing is staged**, do not blindly `git add -A` (it sweeps in secrets,
build output, unrelated work). Show the user the unstaged/untracked files and ask
which to stage, or stage the specific files clearly related to the task.

## 2. Compose the message

Format: `type(scope): subject`

- **type**: `feat` (new capability), `fix` (bug fix), `docs`, `refactor`
  (no behavior change), `perf`, `test`, `build`, `ci`, `chore`. Use what the
  diff actually shows — "add" a whole feature is `feat`; tweaking an existing one
  is usually `refactor`/`fix`.
- **scope**: optional, the module/area touched. Follow the repo's existing scopes.
- **subject**: imperative mood, ≤ ~50 chars, no trailing period, lowercase start
  unless the repo does otherwise.
- **body** (when the change isn't trivial): wrap ~72 cols, explain the *why* and
  any non-obvious tradeoff — not a restatement of the diff.
- **footers**: `BREAKING CHANGE: <desc>` for incompatible changes; issue refs
  (`Closes #123`) only if the user mentioned them.

If `$ARGUMENTS` is given, treat it as a hint for scope/intent — still verify it
against the actual diff.

## 3. Safety

- Refuse to commit obvious secrets (`.env`, keys, tokens, credentials) — warn the
  user instead.
- Never use `--no-verify` / skip hooks unless the user explicitly asks. If a
  pre-commit hook fails, the commit did NOT happen: fix the issue, re-stage, and
  make a **new** commit (do not `--amend` — that would rewrite the prior commit).
- Do not push. Committing and pushing are separate decisions.

## 4. Commit

Use a HEREDOC so the message formats correctly:

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject

Why this change, not what.
EOF
)"
```

Then `git status` to confirm. Report the final message and short SHA.
