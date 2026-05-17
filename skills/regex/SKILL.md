---
name: regex
description: Build, explain, debug, or optimize a regular expression for a specific engine, with test cases and ReDoS-safety in mind. Use when asked to write or fix a regex or match/extract a pattern.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard regex theory (no text reused)
---

# Regex

A regex is only correct against concrete examples. Get examples first, then
build to them.

## 1. Pin down the spec

- What strings must **match**, what must **not** (ask for or infer real samples
  from `$ARGUMENTS` / the codebase).
- Which **engine/flavor**: PCRE, JS (`RegExp`), Python `re`, Go `regexp`
  (RE2 — no backreferences/lookaround), Java, POSIX, ripgrep. Syntax and
  features differ; write for the actual target.
- Anchored or substring? Multiline? Case-insensitive? Unicode?

## 2. Construct deliberately

- Prefer specific character classes over `.*`; use `.*?`/possessive/atomic
  groups to avoid runaway backtracking.
- Use anchors (`^`, `$`, `\b`) so it doesn't match more than intended.
- Name or comment capture groups; use non-capturing `(?:…)` when you don't need
  the group.
- For anything with structure (emails, URLs, dates, code) consider whether a
  parser is the right tool instead — say so if regex is the wrong choice.

## 3. ReDoS check

Reject catastrophic backtracking: nested quantifiers over overlapping classes
(`(a+)+`, `(.*)*`, `(\d+)*$`). On a backtracking engine these hang on crafted
input. Rewrite to be linear (atomic groups, possessive quantifiers, or a
stricter pattern). On RE2/`re2`/Go this isn't a risk but the feature set is
smaller.

## 4. Deliver

Give the final pattern, a plain-English breakdown token-by-token, and a small
table of test inputs → expected result covering matches, non-matches, and edge
cases. If possible, verify it by actually running it in the target language.
