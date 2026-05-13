# Changelog

All notable changes to Fermi are recorded here. Releases that pre-date
this file are on the [GitHub Releases page](https://github.com/FelixRuiGao/Fermi/releases).

The release workflow extracts the section whose heading exactly matches
the pushed tag (e.g. `## v0.3.2-alpha.3`) and uses it as the GitHub
Release notes. A missing or empty section fails CI.

## Unreleased

- Permissions: compound commands with a trailing redirect (e.g. `cd dir && npm install 2>&1`, `pnpm install && pnpm build > build.log`) now offer "Always allow" for the inner command just like the same command without the redirect. Previously the redirect forced a one-time approval.
- GUI: replaced the three separate Models/Skills/Integrations modals with a single unified Settings dialog (left-nav rail + scrollable right content). Six sections: General, Models, Providers, Skills, MCP Servers, Hooks. Opens via the sidebar footer menu or the new `⌘,` shortcut.
- GUI: real CRUD in Settings now writes through to `~/.fermi/settings.json` — Add/Edit/Delete MCP servers via inline form (name / command / args / env / URL); change Default model / Thinking level / Permission mode from dropdowns. Skills toggles use a right-aligned iOS-style switch.
- GUI transcript: `write_file` / `edit_file` tool calls now render as a card with file-type icon, +N/−M diff stats, and an inline unified diff with line numbers and red/green rows (replaces the prior `path +N` chip).
- GUI transcript: code blocks gained a hover "Copy" button. Reasoning blocks ("Thinking") gained a soft left-accent stripe.
- GUI composer: model picker is grouped by provider with brand labels and capability icons (thinking, multimodal); active model badged. Permission picker shows a colored status dot (safe / default / risky). Token counter tints to warning then error as context fills. `@path` reference hint surfaced in the placeholder. `Esc` interrupts a running turn.
- GUI sidebar: top-level "New session ⌘N" button + `⌘N` keybinding; hover pin overlaps fixed; "Show all N" affordance got a chevron.
- GUI session backend: new RPCs `session.getSummarizeTargets` / `session.getContextIdsForTurnRange` so the GUI's Summarize dialog can drive the same picker flow the TUI's `/summarize` command uses.
- GUI session backend: new IPC `settings.upsertMcpServer` / `settings.deleteMcpServer` / `settings.updateDefaults` to support the inline Settings forms above.

<!--
Drop entries here as commits land. At release time:
  1. Rename this heading to the tag, e.g. `## v0.3.2` or `## v0.3.2-alpha.3`.
  2. Add a fresh empty `## Unreleased` above.
  3. Commit, then `git tag` and push.
-->
