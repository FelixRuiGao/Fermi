---
name: codemod
description: Perform a large, mechanical, cross-file code change correctly — API rename, signature change, import migration, pattern replacement — using AST tools where possible. Use for repo-wide systematic edits.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of coding agents (no text reused)
---

# Codemod

A repetitive change across many files. The risk is partial application and
false matches — be systematic, not regex-happy.

## 1. Define the transformation precisely

State the exact before → after, the boundary (what must NOT change — strings,
comments, a same-named but unrelated symbol), and the file set. `$ARGUMENTS`
describes the change. Find the true scope with `grep`/`glob` and count the sites
so you can verify completeness later.

## 2. Choose the right tool

- **AST-based (preferred)** for code semantics: `jscodeshift`/`ast-grep`
  (`sg`)/`ts-morph` for JS/TS, `comby` (multi-language structural), `libcst`/
  `Bowler` for Python, `gofmt -r`/`eg` for Go, IDE/LSP rename for pure renames.
  AST tools won't corrupt strings/comments or match coincidental text.
- **Regex** only for genuinely textual, low-ambiguity changes — and review every
  hit.
- Prefer the codebase's/framework's official codemod if one exists.

## 3. Apply in a controlled way

- Do a dry run / preview diff first; eyeball a representative sample.
- Apply, then **review the full diff** — look specifically for over-application
  (matched something unrelated) and under-application (missed a syntax variant:
  aliased imports, re-exports, dynamic usage, generated code).
- Handle the long tail by hand; don't force the tool to cover every edge.

## 4. Verify completeness and correctness

Re-grep for the old pattern → expect zero legitimate remaining (explain any
intentional leftovers). Run typecheck, lint, build, and the full test suite — a
codemod that compiles can still be semantically wrong. Report sites changed,
tool used, and verification evidence. Keep it to the one transformation; don't
fold in unrelated cleanup.
