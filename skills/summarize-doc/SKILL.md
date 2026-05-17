---
name: summarize-doc
description: Summarize a long document, log, transcript, thread, or set of files into a faithful, structured brief at the requested depth. Use when the user wants a summary, TL;DR, or digest of long content.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; general summarization practice (no text reused)
---

# Summarize

A summary is only useful if it's faithful and actually shorter. No invention, no
padding.

## 1. Clarify the job

From `$ARGUMENTS` / context establish: the source (file, log, PR thread,
transcript), the **audience & purpose** (exec TL;DR? technical digest? action
items?), and the target length. Read the *entire* source before writing — a
summary from the first page is wrong.

## 2. Choose the structure to fit the content

- **Document/article** → 1-line thesis, key points, conclusion.
- **Decision thread / meeting** → decisions made, open questions, action items
  with owners, points of disagreement.
- **Logs / incident** → timeline, the failure, root cause if determinable,
  impact, what's still unknown.
- **Code/PR** → what changed and why, risk, what a reviewer should focus on.
- Long/structured source → progressive: one-line TL;DR, then a short paragraph,
  then bullets — so the reader stops at the depth they need.

## 3. Fidelity rules

- Represent the source's actual content and emphasis; don't inject your opinion
  or outside facts.
- **Never fabricate** specifics (numbers, names, decisions). If something is
  ambiguous in the source, say it's unclear — don't resolve it by guessing.
- Preserve critical caveats, conditions, and dissent — dropping the "but only
  if X" changes the meaning.
- Quote sparingly and exactly when wording matters (legal, commitments).

## 4. Deliver

Lead with the single most important takeaway. Keep it genuinely concise. If the
source is too large to hold at once, summarize in sections then synthesize a
top-level summary from those — and say you did so. Note anything you could not
access or that was truncated.
