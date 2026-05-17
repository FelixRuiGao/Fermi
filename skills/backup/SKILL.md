---
name: backup
description: Make a safe, verifiable local backup of files or a directory before a risky operation, and know how to restore it. Use before destructive edits/migrations, or when the user asks to back something up.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard safe-copy practice (no text reused)
---

# Backup

A backup you didn't verify is not a backup. Make it, prove it, explain restore.

## 1. Decide what and where

Identify the exact paths (`$ARGUMENTS`) and their size (`du -sh`). Choose a
backup location **outside** the working tree (a sibling dir or `/tmp` with a
timestamped name) so the backup isn't swept by the same operation it's
protecting against:

```
<name>.bak.YYYYMMDD-HHMMSS
```

Prefer git when applicable: if the target is tracked and clean, a commit or
`git stash`/branch/tag is the cleanest, most reliable checkpoint — suggest that
first.

## 2. Copy safely

- Preserve metadata: `cp -a`, or `rsync -a --info=stats1` for large trees, or a
  timestamped `tar -czf` for a single archive.
- **Never** move (`mv`) the original as a "backup" — copy, leaving the source
  intact until the risky op is verified done.
- Exclude junk (`node_modules`, build dirs) only if clearly safe; when unsure,
  back up everything requested.

## 3. Verify the backup

This step is mandatory:

- Compare counts/sizes: file count and `du -sh` of source vs backup match.
- Spot-check: `diff -r` a sample, or `tar -tzf archive.tgz | wc -l` and list a
  few entries; checksum critical files (`shasum`) if integrity matters.
- Confirm the backup is readable and complete before declaring it safe to
  proceed.

## 4. Hand back

Report: backup location, what it contains, verification result, and the **exact
restore command** (`rsync -a back/ orig/`, `tar -xzf …`, `git stash pop`,
`git checkout <tag>`). Do not delete any backup; let the user remove it once
they're satisfied.
