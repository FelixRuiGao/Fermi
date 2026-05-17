---
name: bash-script
description: Write or harden a robust, portable shell script — strict mode, quoting, error handling, and shellcheck-clean. Use when asked to write a bash/sh script or fix a fragile one.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard defensive shell-scripting practice (no text reused)
---

# Bash Script

Most shell bugs are unquoted variables and unchecked failures. Write defensively.

## 1. Decide the target shell

`#!/usr/bin/env bash` for bash features; `#!/bin/sh` (POSIX) only if it must run
where bash is absent (Alpine, BusyBox) — then avoid bashisms (`[[`, arrays,
`local` semantics). `$ARGUMENTS` is the task. Match an existing script's style
if extending one.

## 2. Structure

- Strict mode: `set -euo pipefail` and a sane `IFS`. Add an `ERR`/`EXIT` trap
  for cleanup of temp files.
- **Quote every expansion**: `"$var"`, `"$@"` (not `$*`), `"${arr[@]}"`. This is
  the #1 source of bugs with spaces/globs/empty values.
- Prefer `$( … )` over backticks; `[[ … ]]` over `[ … ]` in bash; arithmetic
  with `(( … ))`.
- Check that required commands exist (`command -v`), validate arguments and
  print a `usage()` on misuse, exit with meaningful codes.
- `mktemp` for temp files/dirs; clean up in the trap. Never `rm -rf "$VAR/"`
  where `$VAR` could be empty — guard it.
- Don't parse `ls`; iterate with globs or `find -print0 | while IFS= read -r -d
  ''`. Read files with `while IFS= read -r line`.
- Long options and comments for non-obvious parts; keep functions small.

## 3. Safety

Never interpolate untrusted input into a command string or `eval`. Be explicit
about destructive operations and require a confirmation/`--force` flag for them.

## 4. Verify

Run `shellcheck` on it and fix every warning (don't blanket-disable). Test the
happy path and a failure path (missing arg, missing command). Deliver the script
plus a one-line summary of what it does and its exit codes.
