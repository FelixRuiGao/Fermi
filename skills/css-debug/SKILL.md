---
name: css-debug
description: Diagnose a CSS/layout bug — overflow, misalignment, z-index/stacking, collapse, specificity, fl/ grid issues — and fix the root cause. Use when something renders wrong, is misaligned, or won't position correctly.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; CSS rendering-model knowledge (no text reused)
---

# CSS Debugging

Layout bugs are almost always the box model, the containing block, or
specificity — not magic. Find which.

## 1. Reproduce and isolate

Identify the broken element and the symptom (`$ARGUMENTS`). Inspect computed
styles (not just the authored rule — something is overriding it). The fastest
isolation: temporarily outline elements (`* { outline: 1px solid red }`) to see
actual box sizes/overflow.

## 2. Diagnose by category

- **Specificity / override**: the rule you wrote isn't winning. Check computed
  styles for what actually applies; cascade, specificity, source order,
  `!important`, inline styles. Fix by raising specificity correctly or removing
  the conflicting rule — not by piling on `!important`.
- **Box model**: unexpected size = `box-sizing`, padding/border adding width,
  margins. Margin **collapse** between/parent-child explains "mysterious" gaps
  or missing space.
- **Overflow / scrollbars**: a child wider than parent (long word, fixed width,
  `min-width:auto` on a flex item — a very common one), missing
  `overflow`/`min-width:0`.
- **Flexbox**: `min-width/height: auto` preventing shrink, `flex` shorthand,
  alignment axis confusion (`justify` vs `align`), wrap.
- **Grid**: implicit vs explicit tracks, `fr` vs `minmax`, item placement,
  `min-content` blowups.
- **Positioning / stacking**: `z-index` only works on positioned/flex/grid
  items and is trapped by **stacking contexts** (transform/opacity/filter create
  one — the usual "z-index does nothing" cause). `position: absolute` resolves
  against the nearest positioned ancestor (the containing block).
- **Sizing**: percentage heights need a sized parent; `100vh` mobile address-bar
  issue; collapsed parent because all children are floated/absolute.

## 3. Fix the cause

Fix the actual mechanism (give the flex item `min-width:0`, remove the stray
stacking context, correct the containing block) — not a magic-number nudge
(`margin-top: -7px`, random `z-index: 9999`) that breaks elsewhere.

## 4. Verify visually

CSS cannot be verified by reading it — render it and look, at multiple widths
and with real/long content (see `responsive`, `frontend-design`). Confirm the
fix didn't regress siblings. Report the root cause and the fix; if you couldn't
render it, say so.
