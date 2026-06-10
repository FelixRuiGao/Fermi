---
title: "GitHub Copilot"
---

Fermi 可以把你的 GitHub Copilot 订阅作为模型提供商使用。认证使用 GitHub Device Flow，与 VS Code 的 Copilot 扩展使用的机制相同。

## 登录

在 Fermi 会话中使用 `/copilot` 命令，或从 CLI 运行 OAuth 命令：

```bash
fermi oauth login copilot
```

也可以在会话内：

```text
/copilot
```

流程：
1. Fermi 显示一个 URL（`https://github.com/login/device`）和一次性 code。
2. 在任意浏览器打开 URL 并输入 code。
3. 用 GitHub 账号授权应用。
4. Fermi 保存 token，Copilot 模型变为可用。

## Token 存储

GitHub token 保存在 `~/.fermi/state/oauth.json` 的 `github_copilot` 字段。该 token 不会自行过期，会一直有效，直到你在 GitHub 账号设置中撤销应用。

## 可用模型

登录后，模型列表会从 GitHub 的 Copilot catalog（`/models`）实时获取，因此 `/model` 选择器会准确反映你的订阅可以调用的模型。新模型会自动出现，你的套餐无法使用的模型会被隐藏。典型模型包括 Claude Opus 4.8 / 4.7、Claude Sonnet 4.6，以及 GPT-5.x 系列（5.3 Codex、5.4、5.4 Mini、5.5、5 Mini）。

## 计费

GitHub Copilot 已在 **2026 年 6 月 1 日**转向**按用量计费**。大多数账号现在消耗 **GitHub AI Credits**，按每个模型公开费率计量 token 用量（input + output + cached），不再有固定的按模型 "multiplier"。Copilot Pro 包含 $10/月 credits；Pro+ 包含 $39/月。代码补全不消耗 credits；agentic/chat 用量会消耗。可在 GitHub billing 设置中跟踪余额。

### 旧版 premium-request multipliers（仅年度计划）

如果你使用的是尚未迁移的**年度** Pro/Pro+ 计划，旧版 premium-request multipliers 仍然适用（且在 6 月 1 日大幅上涨）。参考如下：

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

这些数字不适用于按用量计费（AI Credits）的账号。来源：[GitHub Docs — model multipliers for annual plans](https://docs.github.com/en/copilot/reference/copilot-billing/model-multipliers-for-annual-plans)。

## 检查状态

```bash
fermi oauth status copilot
```

这会显示 Fermi 是否已保存 GitHub Copilot 凭据。

## 登出

```bash
fermi oauth logout copilot
```

这会移除已保存的 token。你也可以在 GitHub 账号设置的 **Settings > Applications > Authorized GitHub Apps** 中撤销访问。

## 工作原理

Fermi 使用公开的 VS Code Copilot client ID 进行 GitHub Device Flow。获取 GitHub 用户 token 后，它会通过 GitHub 内部 Copilot token 端点换取短期 Copilot API token。该 API token 会在会话中按需自动刷新。

请求会通过 Copilot API 路由，并携带 VS Code Copilot 扩展使用的相同 editor-identification headers。

## 要求

- 有效的 GitHub Copilot 订阅（Individual、Business 或 Enterprise）。
- 已启用 Copilot 的 GitHub 账号。

## 限制

- 登录仅支持 Device Flow（没有基于浏览器的 PKCE flow）。
- 如果 GitHub 撤销 token（例如用户从账号移除应用），Fermi 会提示你重新认证。
