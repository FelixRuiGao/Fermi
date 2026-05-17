---
name: tech-writing
description: Edit technical prose for clarity, structure, and concision without changing technical meaning — docs, READMEs, error messages, comments, release notes. Use when asked to polish, tighten, or proofread technical writing.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; general technical-editing principles (no text reused)
---

# Technical Writing Edit

Make it clearer and shorter while keeping every technical fact exactly correct.

## 1. Understand intent and audience first

Read the whole piece and the surrounding context (what is this, who reads it,
what should they do after). `$ARGUMENTS` is the target text/file. Preserving
**meaning** is non-negotiable — if you don't understand a technical claim, ask
rather than rephrasing it into something subtly wrong.

## 2. Edit for these, in order

1. **Structure** — most important point first (BLUF). Reorder so the reader
   gets the answer before the backstory. One idea per paragraph.
2. **Concision** — cut filler ("in order to" → "to", "it should be noted
   that" → delete), redundancy, and throat-clearing. Shorter sentences.
3. **Clarity** — active voice and a concrete subject ("the parser fails" not
   "failures may be encountered"); define a term once; consistent terminology
   (don't call the same thing three names).
4. **Precision** — exact verbs and numbers; replace vague ("fast", "should
   work", "various") with specifics or flag them as unknown.
5. **Mechanics** — consistent formatting, parallel list structure, code/UI in
   `code font`, correct grammar/spelling.

## 3. Voice

Match the project's existing tone (read neighboring docs). Direct and neutral;
no marketing adjectives in technical docs; instructions in the imperative.

## 4. Deliver

Provide the edited text. If the change is non-trivial, briefly note the
substantive changes (structure moved, claim that was ambiguous, term
standardized) so the author can confirm meaning was preserved. Never introduce a
new technical claim the source didn't make.
