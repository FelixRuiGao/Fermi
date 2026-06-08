---
title: "GitHub Copilot"
---

Fermi can use your GitHub Copilot subscription as a model provider. Authentication uses the GitHub Device Flow -- the same mechanism used by VS Code's Copilot extension.

## Login

Use the `/copilot` command inside a Fermi session, or run the OAuth command from the CLI:

```bash
fermi oauth login copilot
```

Or inside a session:

```text
/copilot
```

The flow:
1. Fermi displays a URL (`https://github.com/login/device`) and a one-time code.
2. Open the URL in any browser and enter the code.
3. Authorize the application with your GitHub account.
4. Fermi stores the token and Copilot models become available.

## Token Storage

The GitHub token is stored in `~/.fermi/state/oauth.json` under the `github_copilot` field. The token does not expire on its own -- it remains valid until you revoke the application from your GitHub account settings.

## Available Models

The model list is fetched live from GitHub's Copilot catalog (`/models`) after you log in, so the `/model` picker always reflects exactly what your subscription can call — new models appear automatically, and models your plan can't use are hidden. Typical models include Claude Opus 4.8 / 4.7, Claude Sonnet 4.6, and the GPT-5.x family (5.3 Codex, 5.4, 5.4 Mini, 5.5, 5 Mini).

## Billing

GitHub Copilot moved to **usage-based billing on June 1, 2026**. Most accounts now consume **GitHub AI Credits**, billed by token usage (input + output + cached) at each model's published rate — there is no fixed per-model "multiplier." Copilot Pro includes $10/month of credits; Pro+ includes $39/month. Code completions don't consume credits; agentic/chat usage does. Track your balance in GitHub's billing settings.

### Legacy premium-request multipliers (annual plans only)

If you're on an **annual** Pro/Pro+ plan that hasn't yet migrated, the older premium-request multipliers still apply (and rose sharply on June 1). For reference:

| Model | Multiplier |
|-------|-----------|
| Claude Opus 4.8 | 27× |
| Claude Opus 4.7 | 27× |
| Claude Sonnet 4.6 | 9× |
| Claude Haiku 4.5 | 0.33× |
| GPT-5.3 Codex | 6× |
| GPT-5.4 | 6× |
| GPT-5.4 Mini | 6× |
| GPT-5.5 | 57× |
| GPT-5 Mini | 0.33× |

These figures don't apply to usage-based (AI Credits) accounts. Source: [GitHub Docs — model multipliers for annual plans](https://docs.github.com/en/copilot/reference/copilot-billing/model-multipliers-for-annual-plans).

## Checking Status

```bash
fermi oauth status copilot
```

This shows whether Fermi has stored GitHub Copilot credentials.

## Logging Out

```bash
fermi oauth logout copilot
```

This removes the stored token. You can also revoke access from your GitHub account settings under **Settings > Applications > Authorized GitHub Apps**.

## How It Works

Fermi uses the public VS Code Copilot client ID for the GitHub Device Flow. After obtaining a GitHub user token, it exchanges it for a short-lived Copilot API token via GitHub's internal Copilot token endpoint. This API token is automatically refreshed as needed during a session.

Requests are routed through the Copilot API with the same editor-identification headers used by VS Code's Copilot extension.

## Requirements

- An active GitHub Copilot subscription (Individual, Business, or Enterprise).
- A GitHub account with Copilot enabled.

## Limitations

- Only the Device Flow is available for login (no browser-based PKCE flow).
- If GitHub revokes the token (e.g., the user removes the app from their account), Fermi will prompt you to re-authenticate.
