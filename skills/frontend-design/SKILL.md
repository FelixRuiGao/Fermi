---
name: frontend-design
description: Build a polished, distinctive UI that avoids generic AI-template aesthetics — strong layout, hierarchy, type, spacing, motion, and states. Use when creating or restyling a web page, component, or app UI.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; general visual-design principles (no text reused)
---

# Frontend Design

Default AI output looks the same: centered card, purple gradient, generic
sans, no point of view. Aim higher — intentional and distinctive, not templated.

## 1. Establish a direction first

Before coding, decide a concrete visual point of view from the product's
purpose and `$ARGUMENTS`: a mood (precise/editorial/playful/brutalist/calm), a
reference feel, and constraints (brand, existing design system, framework). If a
design system / token set exists in the repo, **use it** — consistency beats
novelty inside an app.

## 2. Get the fundamentals right (this is where quality comes from)

- **Layout & hierarchy**: a clear focal point and reading order; intentional
  asymmetry/whitespace over everything-centered; a real grid.
- **Type**: a deliberate pairing, not the system default; strong size/weight
  contrast for hierarchy; sane measure (~60–75ch); tight, consistent scale.
- **Color**: a restrained, intentional palette with a real accent; sufficient
  contrast (WCAG — see `accessibility`); not the default Tailwind rainbow.
- **Space**: consistent spacing scale; generous, deliberate negative space;
  alignment everywhere.
- **Detail**: considered borders/shadows/radii (one language, not mixed);
  purposeful, fast micro-interactions; `prefers-reduced-motion` respected.

## 3. Build all the states

A real UI is not just the happy desktop view. Implement: hover/focus/active/
disabled, **loading**, **empty**, **error**, long-content overflow, and
**responsive** down to mobile (see `responsive`). Keyboard-accessible and
semantic by construction (see `accessibility`) — not bolted on.

## 4. Verify visually

This cannot be verified by reading code. Run it and actually look (Fermi's
browser/preview tooling if available; otherwise tell the user it needs visual
QA). Check the golden path and the edge states at multiple widths. Iterate on
what looks off. Report what you couldn't visually verify rather than claiming
it's polished.
