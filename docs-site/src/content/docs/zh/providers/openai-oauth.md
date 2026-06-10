---
title: "ChatGPT OAuth 登录"
---

除了使用 OpenAI API key，你也可以通过 OAuth 登录 ChatGPT 账号。这会使用 `chatgpt.com` 上的 OpenAI Codex 后端。

## 登录方式

运行 `fermi oauth` 会先询问**要登录哪个服务**：OpenAI (ChatGPT) 或 GitHub Copilot。选择 OpenAI (ChatGPT) 即可使用本页描述的 Codex 后端。随后 Fermi 会提供两种登录方式：

### 浏览器登录 (PKCE) -- 推荐

打开默认浏览器进行一键认证。最适合本地开发。

```bash
fermi oauth
# Select "OpenAI (ChatGPT)", then "Browser"
```

流程：
1. 本地回调服务器在 `http://localhost:1455` 启动。
2. 浏览器打开 OpenAI 授权页。
3. 用 ChatGPT 账号登录并授权 Fermi。
4. 浏览器重定向回本地服务器完成流程。

### Device Code -- 备用

用于 SSH 或无头环境等没有可用浏览器的场景。

```bash
fermi oauth
# Select "OpenAI (ChatGPT)", then "Device Code"
```

流程：
1. Fermi 显示 URL 和 code。
2. 在任意设备打开 URL 并输入 code。
3. 用 ChatGPT 账号登录。
4. Fermi 轮询完成状态并保存 token。

## Token 存储

OAuth token 保存到 `~/.fermi/state/oauth.json`。Access token 过期时会自动刷新（提前 2 分钟刷新）。

## 管理 OAuth

```bash
# Check login status (reports both OpenAI and Copilot)
fermi oauth status

# Log out (prompts for which service to log out of)
fermi oauth logout
```

## 在初始化向导中使用 OAuth

运行 `fermi init` 时，其中一个提供商选项是 **OpenAI (ChatGPT Login)**。选择它会触发 OAuth 登录流程。随后 Fermi 会为该提供商保存内部 OAuth 标记，并从 `~/.fermi/state/oauth.json` 解析实际 access token，因此不需要 API-key 环境变量。如果该提供商已配置，之后可以用 `/model` 切回它。

认证后，以下模型可用：

- GPT-5.2 Codex
- GPT-5.3 Codex
- GPT-5.4
- GPT-5.4 Mini
- GPT-5.5（上下文上限 400K，而标准 API 为 1M）

## 限制

ChatGPT OAuth 后端与标准 OpenAI API 有一些差异：

- 请求会携带 `store: false`（对话不会存储在 OpenAI 侧）。
- 该端点不提供原生 web search。
- 可用性取决于你的 ChatGPT 订阅计划。
