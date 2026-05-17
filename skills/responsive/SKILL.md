---
name: responsive
description: Make a UI work well across screen sizes — fluid layout, sensible breakpoints, touch targets, readable type, no overflow. Use when adapting a page/component for mobile/tablet or fixing responsive breakage.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; responsive-design principles (no text reused)
---

# Responsive Design

Design for fluidity first; add breakpoints only where the layout actually
breaks — don't hardcode three fixed widths.

## 1. Assess the current behavior

Identify the component/page (`$ARGUMENTS`) and where it breaks: horizontal
scroll, clipped content, tap targets too small, unreadable type, broken grid.
Match the project's existing responsive approach (breakpoint tokens, container
queries, framework utilities) — be consistent.

## 2. Apply the principles

- **Fluid by default**: percentages/`fr`/`flex`/`minmax`/`clamp()` and
  `min()`/`max()` so it scales smoothly; breakpoints only at the points it
  genuinely needs to reshape, not arbitrary device sizes.
- **Mobile-first**: base styles for small screens, layer up with `min-width`
  queries — usually simpler and avoids override soup.
- **Prefer container queries** for truly reusable components (they respond to
  their container, not the viewport) when the stack supports it.
- **No overflow**: fluid media (`max-width:100%`), wrap/`min-width:0` on flex
  children, `overflow-wrap` for long strings, responsive tables (scroll
  container or reflow).
- **Touch & readability**: ≥ ~44px touch targets, body type ≥16px (avoids iOS
  zoom), comfortable measure, adequate spacing on small screens.
- **Viewport meta** present; test the real mobile-100vh issue (`dvh`).
- Respect `prefers-reduced-motion`; don't ship desktop-only hover affordances
  with no touch equivalent.

## 3. Verify at real widths

Must be looked at, not reasoned about: render at narrow (~360px), tablet
(~768px), desktop, and a very wide viewport, with **long/real content**. Check
no horizontal scroll, nothing clipped, interactive targets usable. Use Fermi's
browser/preview tooling if available; otherwise state it needs visual QA.
Report the breakpoints chosen and why, and what you couldn't visually verify.
