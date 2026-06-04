# Fermi for VS Code

A sidebar chat panel for [Fermi](https://github.com/FelixRuiGao/Fermi) — an AI coding agent built for long sessions. Same backend as the terminal app, in your editor.

## Features

- **Streaming chat** with markdown rendering and collapsible tool-call cards
- **Inline diffs** — review file changes in VS Code's diff editor
- **Permission control** — approve / read-only / full-access, switchable per session
- **Model picker, slash commands, and `@file` context** from the editor
- **Shared sessions with the terminal** — conversations started in the Fermi TUI appear in the extension's history, and vice versa. Click one to open it in a tab.
- **Remote SSH** — runs on the remote host; files, credentials, and sessions stay remote
- **One-click install** — if the `fermi` binary isn't found, install it without leaving the editor

## Requirements

The extension drives the `fermi` binary. If it isn't installed, the welcome view offers a one-click install (downloads the latest release into `~/.fermi/bin`). Over Remote SSH, it installs on the remote host.

## Getting started

1. Open the Fermi panel from the activity bar.
2. If prompted, click **Install Fermi**, then complete the first-run setup (provider + model).
3. Ask a question or describe a task. `Enter` sends, `Shift+Enter` for a newline.

## License

[MIT](./LICENSE)
