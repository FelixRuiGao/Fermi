---
name: doc-coauthor
description: Co-author a structured long-form document (design doc, RFC, proposal, technical spec) through context-gathering, outline, draft, and revision. Use when writing a design doc, RFC, spec, or proposal.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; capability-level survey of doc-writing workflows (no text reused)
---

# Document Co-Authoring

Don't dump a finished doc from a one-line prompt. Build it with the user so it
reflects *their* intent, not your invention.

## 1. Gather context before writing

Establish, by asking only what you can't infer from the repo/conversation:

- **Document type & audience** — RFC for engineers? proposal for leadership?
  spec for implementers? This sets depth, jargon, and what to justify.
- **The core thesis** — the one thing the reader must accept or decide.
- **Constraints & non-goals** — scope boundaries, deadlines, prior decisions
  (check existing ADRs/docs).
- Look for a house template (`CONTRIBUTING`, `docs/templates/`, prior RFCs) and
  follow it.

`$ARGUMENTS` is the topic/working title.

## 2. Outline first, get alignment

Produce a section outline with a one-line intent per section. **Confirm the
outline with the user before drafting** — restructuring an outline is cheap;
rewriting 2000 words is not.

## 3. Draft

- Lead with the conclusion/recommendation (BLUF) — busy readers decide from the
  top.
- One idea per section; concrete over abstract; claims backed by reasoning or
  data, not assertion.
- Present real alternatives and tradeoffs honestly (especially for
  RFC/design/proposal) — a doc that only argues one side doesn't earn trust.
- Mark open questions explicitly rather than papering over uncertainty.
- **Never fabricate** facts, numbers, quotes, or rationale. If you don't know,
  write `[TODO: confirm …]` and ask.

## 4. Revise with the user

Share the draft, take direction section by section, tighten. Cut anything that
doesn't serve the thesis. End with a self-check: does a target reader, cold,
get the point and what's being asked of them? Report open `[TODO]`s for the
user to resolve.
