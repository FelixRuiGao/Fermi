# Changelog

All notable changes to Fermi are recorded here. Releases that pre-date
this file are on the [GitHub Releases page](https://github.com/FelixRuiGao/Fermi/releases).

The release workflow extracts the section whose heading exactly matches
the pushed tag (e.g. `## v0.3.2-alpha.3`) and uses it as the GitHub
Release notes. A missing or empty section fails CI.

## Unreleased

- TUI: scrollbar thumb now renders at 1/8-cell precision (eighth-block characters) instead of 1/2-cell, so the thumb glides smoothly along the rail line-by-line instead of jumping in half-cell increments on long conversations. Added a dedicated `scrollbarThumb` palette token alongside the existing `scrollbarTrack` so the rail (now a solid mid-grey instead of empty space) and the thumb (matches body-text colour) are visually distinct. Default minimum thumb size drops from 4 cells to 1 cell, matching the look of other agent terminals like amp; on very long content the thumb is small but stays buttery-smooth as it moves. Dragging the thumb with the mouse is now sub-cell smooth too on terminals that support SGR-Pixels mouse reporting (kitty, Ghostty, WezTerm, iTerm2, recent xterm, VS Code): ScrollBar no longer rounds the scroll position to integer cells, and when the terminal reports the mouse in pixels the position is decoded at fractional-cell resolution. Terminals without pixel mouse reporting (e.g. macOS Terminal.app) fall back to the previous cell-quantized drag with no change in behaviour.
- TUI: switching to a detail tab (clicking a thinking/tool entry) and back no longer resets the transcript to the bottom or clears the composer. The main view now stays mounted with Yoga `Display.None` instead of being unmounted, so scroll position and textarea contents survive tab switches. As part of the same change the composer is now anchored to the bottom of the screen at all times — previously it lived inside the scrollbox and would scroll off-screen when reading history; now scrolling history keeps the input visible, and typing no longer auto-scrolls the transcript to the bottom.
- TUI perf: cut shiki preload from 41 languages to 9 (typescript/tsx/js/jsx, python, bash, json, markdown, diff); everything else lazy-loads on first encounter, briefly flashing a highlight.js fallback while loading. Combined with a synchronous `Bun.gc()` at turn boundaries (throttled to once per 10 s on completed turns), startup peak memory drops by ~130 MB and one observed long session reclaimed ~160 MB the instant a turn ended.
- TUI: body text now follows the terminal's configured foreground (OSC 10) in auto theme mode — so dark/light terminal themes give matching text colour without per-theme tuning. Pinned `FERMI_THEME=light|dark`, or OSC-unresponsive terminals, keep the token-table palette as a contrast-safety fallback.
- TUI: tool results (`list`, `glob`, `grep`, `bash`, `bash_output`, `web_search`, `web_fetch`, `send`, `apply_edits`) now collapse to a single truncated line with a clickable "N more lines, CLICK to open" fold indicator. Errors still expand to 8 lines. Reduces visual noise during long sessions.
- TUI: input prompt `❯` and textarea cursor changed from accent blue to neutral white — works better across terminal palettes and stops fighting with the brand accent.
- Permissions: compound commands with a trailing redirect (e.g. `cd dir && npm install 2>&1`, `pnpm install && pnpm build > build.log`) now offer "Always allow" for the inner command just like the same command without the redirect. Previously the redirect forced a one-time approval.
- GUI: replaced the three separate Models/Skills/Integrations modals with a single unified Settings dialog (left-nav rail + scrollable right content). Six sections: General, Models, Providers, Skills, MCP Servers, Hooks. Opens via the sidebar footer menu or the new `⌘,` shortcut.
- GUI: real CRUD in Settings now writes through to `~/.fermi/settings.json` — Add/Edit/Delete MCP servers via inline form (name / command / args / env / URL); change Default model / Thinking level / Permission mode from dropdowns. Skills toggles use a right-aligned iOS-style switch.
- GUI transcript: `write_file` / `edit_file` tool calls now render as a card with file-type icon, +N/−M diff stats, and an inline unified diff with line numbers and red/green rows (replaces the prior `path +N` chip).
- GUI transcript: code blocks gained a hover "Copy" button. Reasoning blocks ("Thinking") gained a soft left-accent stripe.
- GUI composer: model picker is grouped by provider with brand labels and capability icons (thinking, multimodal); active model badged. Permission picker shows a colored status dot (safe / default / risky). Token counter tints to warning then error as context fills. `@path` reference hint surfaced in the placeholder. `Esc` interrupts a running turn.
- GUI sidebar: top-level "New session ⌘N" button + `⌘N` keybinding; hover pin overlaps fixed; "Show all N" affordance got a chevron.
- GUI session backend: new RPCs `session.getSummarizeTargets` / `session.getContextIdsForTurnRange` so the GUI's Summarize dialog can drive the same picker flow the TUI's `/summarize` command uses.
- GUI session backend: new IPC `settings.upsertMcpServer` / `settings.deleteMcpServer` / `settings.updateDefaults` to support the inline Settings forms above.
- GUI transcript: expanded tool-call output (bash / read_file / etc.) gained a hover "Copy output" button, matching the markdown code-block pattern.
- GUI right-pane empty states: Plan, Agents, and Shells panels each gained a one-line explainer ("checkpoints come from plan.md", "sub-agents appear here when spawned", "bash_background processes appear here") so empty panels are self-documenting.
- GUI right-pane Files: filter input got an X clear button — matches the Settings search inputs.

<!--
Drop entries here as commits land. At release time:
  1. Rename this heading to the tag, e.g. `## v0.3.2` or `## v0.3.2-alpha.3`.
  2. Add a fresh empty `## Unreleased` above.
  3. Commit, then `git tag` and push.
-->
