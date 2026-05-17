---
name: mermaid
description: Generate a correct Mermaid diagram (flowchart, sequence, ER, class, state, gitgraph, etc.) from code or a description, with valid syntax. Use when asked for a diagram, architecture/flow visualization, or to visualize a process.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Mermaid syntax (public) — no text reused
---

# Mermaid Diagram

Pick the right diagram type, derive it from reality, and make the syntax
actually render.

## 1. Choose the type

- **flowchart** (`flowchart TD`) — logic/process/decision flow.
- **sequenceDiagram** — interactions/messages over time between
  services/actors.
- **erDiagram** — data model / table relationships.
- **classDiagram** — OO structure / type relationships.
- **stateDiagram-v2** — state machines / lifecycles.
- **gitGraph**, **C4Context**, **gantt** — branching, system context, schedule.

`$ARGUMENTS` describes the subject. If it's an existing system, derive the
diagram from the actual code/schema (read it) — not a plausible guess.

## 2. Author it carefully

- Keep it readable: one view, one purpose; ~5–15 nodes. Split a giant system
  into multiple focused diagrams instead of one unreadable hairball.
- **Escape labels** with special characters: wrap text containing
  `()[]{}:;` or quotes in `"..."` (a common cause of render failure).
- Use stable node IDs separate from display labels (`svc[Auth Service]`).
- Direction (`TD`/`LR`) and subgraphs for grouping; consistent arrow semantics
  (`-->` flow vs `-.->` optional/async — and say what they mean).
- Don't overuse styling; clarity over color.

## 3. Validate

Mermaid syntax errors are easy to make. Verify by rendering if a tool is
available (`mmdc` from `@mermaid-js/mermaid-cli`, or note it can be checked at
mermaid.live). At minimum, re-read the source for balanced brackets/quotes and
correct keywords for the chosen diagram type.

Deliver the diagram in a ```mermaid fenced block, plus one or two sentences on
what it shows and any simplification you made. If embedding into docs, place it
where it's referenced.
