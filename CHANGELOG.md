# Changelog

All notable changes to Fermi are recorded here. Releases that pre-date
this file are on the [GitHub Releases page](https://github.com/FelixRuiGao/Fermi/releases).

The release workflow extracts the section whose heading exactly matches
the pushed tag (e.g. `## v0.3.2-alpha.3`) and uses it as the GitHub
Release notes. A missing or empty section fails CI.

## Unreleased

- Permissions: compound commands with a trailing redirect (e.g. `cd dir && npm install 2>&1`, `pnpm install && pnpm build > build.log`) now offer "Always allow" for the inner command just like the same command without the redirect. Previously the redirect forced a one-time approval.

<!--
Drop entries here as commits land. At release time:
  1. Rename this heading to the tag, e.g. `## v0.3.2` or `## v0.3.2-alpha.3`.
  2. Add a fresh empty `## Unreleased` above.
  3. Commit, then `git tag` and push.
-->
