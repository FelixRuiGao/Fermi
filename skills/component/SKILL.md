---
name: component
description: Scaffold a new UI component that matches the project's framework, design system, conventions, and state/prop patterns — with accessibility and tests. Use when adding a reusable frontend component.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; component-design practice (no text reused)
---

# UI Component

A new component must look like the existing ones — same patterns, same system,
no new snowflake.

## 1. Learn the project's conventions

Read 2–3 existing components first: framework (React/Vue/Svelte/Solid/Angular),
styling approach (CSS modules/Tailwind/styled/vanilla-extract), the design-
system/primitive library in use, file/folder layout, prop-typing, state, and
test conventions. Match all of it. `$ARGUMENTS` describes the component.

## 2. Design the API

- **Props**: minimal, well-typed, named like siblings. Sensible defaults.
  Controlled vs uncontrolled — follow the codebase's pattern; don't mix.
- **Composition over configuration**: prefer `children`/slots and small
  composable parts over a mega-prop god-component.
- Reuse design tokens / primitives — don't hardcode colors, spacing, z-index.
- Side-effect-free render; data fetching/state stays where the codebase puts it.

## 3. Implement completely

- All states: default, hover/focus/active/disabled, loading, empty, error.
- **Accessible by construction**: correct semantic element/role, label,
  keyboard operation, focus management (see `accessibility`) — not an
  afterthought.
- Responsive (see `responsive`); respects theme/dark mode if the app has it.
- No console noise; clean unmount (listeners/timers removed).

## 4. Verify

- A Story/example or usage snippet exercising the main variants.
- Tests in the project's style: behavior + a11y, not implementation details
  (see `test-gen`).
- Typecheck/lint clean. If it has visual surface, it needs an actual look (see
  `frontend-design`) — say so if you couldn't run it.

Report the API, the conventions you matched, and how it was verified.
