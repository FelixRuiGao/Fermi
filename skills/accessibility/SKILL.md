---
name: accessibility
description: Audit and fix web UI for accessibility (WCAG 2.2 AA) — semantics, keyboard, contrast, ARIA, focus, alt text. Use when asked to check or improve a11y of a component or page.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; WCAG 2.2 / WAI-ARIA public standards (no text reused)
---

# Accessibility

Make the UI usable with a keyboard and a screen reader. Target WCAG 2.2 AA.

## 1. Scope

A component, page, or the current diff (`$ARGUMENTS`). Read the markup and any
interaction JS — a11y problems are mostly structural, not cosmetic.

## 2. Check the high-impact issues

- **Semantics first**: real elements (`button`, `a`, `nav`, `main`, `ul`,
  `label`, `h1–h6` in order) before `div`+ARIA. The best ARIA is no ARIA.
- **Keyboard**: every interactive element reachable and operable by keyboard,
  in a logical tab order, with a **visible focus indicator**; no keyboard traps;
  custom widgets implement expected key patterns (Esc closes, arrows in
  menus/tabs).
- **Names & roles**: every control has an accessible name (visible label,
  `aria-label`, `aria-labelledby`); images have meaningful `alt` (empty `alt=""`
  for decorative); icon-only buttons are labeled.
- **Forms**: `label` associated with input, errors linked via
  `aria-describedby`, `aria-invalid`, instructions not by placeholder alone.
- **Contrast**: text ≥ 4.5:1 (3:1 for large/UI components); don't rely on color
  alone to convey meaning.
- **Dynamic content**: live regions for async updates; focus management on
  route change / modal open-close; modals trap focus and restore it on close.
- **Media/motion**: captions/transcripts; respect `prefers-reduced-motion`.
- **Zoom/reflow**: usable at 200% zoom and 320px width without loss.

## 3. Fix and verify

Fix root cause (use the right element) rather than bolting on ARIA. Re-check the
keyboard path manually. Recommend running an automated checker (axe, Lighthouse,
`pa11y`) if available — note these catch ~30–40%; the keyboard/SR walkthrough
catches the rest. Report each issue as `file:line — WCAG criterion — fix`.
