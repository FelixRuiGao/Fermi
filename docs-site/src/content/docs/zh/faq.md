---
title: "常见问题"
---

## 通用

### Fermi 支持哪些平台？

macOS (Apple Silicon)、Linux (x86_64) 和 Windows (x64)。三者都有预构建二进制发布。

### 需要什么运行时？

不需要。Release 以单个自包含二进制发布，运行 Fermi 不需要 Bun、Node 或其他运行时。（只有从源码构建时才需要 Bun 1.3+。）

### Fermi 是免费的吗？

Fermi 本身以 MIT 许可证免费开源。你只需要为所使用模型提供商的 API 用量付费。本地提供商（Ollama、oMLX、LM Studio）没有 API 成本。

## 设置

### 初始设置后如何添加新提供商？

重新运行设置向导：

```bash
fermi init
```

它会检测现有配置，让你在不丢失已配置提供商的情况下添加新提供商。

### 我的 API key 不工作

检查 key 是否正确保存到 `~/.fermi/.env`：

```bash
cat ~/.fermi/.env
```

对 Kimi、MiniMax、GLM、DeepSeek、Xiaomi 和 Qwen，Fermi 会把 key 存入自己的内部槽位（例如 `FERMI_KIMI_API_KEY`、`FERMI_QWEN_API_KEY`）。外部环境变量只会在 `fermi init` 或 `/model` 因缺少 key 而提示时导入。

### 初始化向导找不到本地服务的模型

启动 `fermi init` 前请确保本地服务已经运行。向导会查询服务的模型端点：

- **Ollama:** `http://localhost:11434/v1/models` — 先运行 `ollama serve`
- **oMLX:** `http://localhost:8000/v1/models`
- **LM Studio:** `http://localhost:1234/v1/models` — 从 LM Studio UI 启动本地服务器

### 如何用 ChatGPT 订阅代替 API key？

使用 OAuth 登录流程：

```bash
fermi oauth
```

也可以在会话内使用 `/codex`。这会通过你的 ChatGPT 账号认证。

详情见 [ChatGPT OAuth 登录](/zh/providers/openai-oauth)。

### 如何使用 GitHub Copilot？

在 Fermi 中使用 `/copilot`，通过 device flow 登录 GitHub 账号。认证后，Copilot 模型会出现在 `/model` 选择器中。

详情见 [GitHub Copilot](/zh/providers/copilot)。

## 使用

### 代理运行很慢

上下文大小会影响性能。可以尝试：

1. **总结：** 用 `/summarize` 压缩较早的上下文片段
2. **Compact：** 用 `/compact` 完整重置上下文
3. **切换模型：** 用 `/model` 切换到更快的模型
4. **降低上下文预算：** 在 `~/.fermi/settings.json` 中调低 `context_budget_percent`

### 如何中途停止代理？

按 `Ctrl+C` 中断当前轮次。代理会干净地停止，你可以继续对话。

你也可以随时输入新消息，它会排队并在代理两次动作之间暂停时送达，而不会中断代理。

### 能撤销代理做过的事吗？

可以。`/rewind`（或 `/undo`）会回滚到之前的轮次。它会还原对话状态，以及该轮之后代理造成的文件变更。文件回退使用带冲突检测的已跟踪变更。

### 能恢复之前的会话吗？

可以。使用 `/session`（或 `/resume`）从之前的会话日志中选择，并从离开的地方继续。

### 上下文管理如何工作？

三层协作：

1. **提示压缩** — 上下文增长时系统提示代理总结（60%/80%）
2. **代理发起总结** — 代理检查上下文地图，精确压缩选定块
3. **自动 compact** — 接近限制时触发完整重置的安全网（85%/90%）

完整说明见[上下文管理](/zh/guide/context)。

### AGENTS.md 文件是什么？

每轮都会加载的持久记忆文件：

- `~/.fermi/AGENTS.md` — 全局偏好
- `<project>/AGENTS.md` — 项目特定说明

代理会读取它们作为上下文，也可以写入。它们会跨会话和 compact 重置保留。

### /rewind 如何工作？

`/rewind` 会显示之前轮次的选择器。选中某轮后，Fermi 会：

1. 将对话回滚到该轮（丢弃之后所有条目）
2. 还原该轮之后代理造成的文件变更（跟踪的 edits、writes、mkdir/cp/mv）
3. 报告冲突（代理修改后又被外部修改的文件会跳过）

这意味着你可以一步撤销对话方向和实际文件影响。

## 子代理

### 可以同时运行多少个子代理？

没有硬性上限。实际限制取决于模型提供商的 rate limit 和任务复杂度。

### 子代理和主代理共享上下文吗？

不共享。每个子代理都有自己的上下文窗口。它们共享同一文件系统和项目，但保持独立对话。子代理完成后结果会送回主代理。

### 子代理能用更便宜的模型吗？

可以。使用 `/tier` 配置 high/medium/low 模型层级。生成子代理时，代理可以设置 `model_level="low"`，让简单任务使用更便宜的模型。

## 技能

### 技能存放在哪里？

在 `~/.fermi/skills/`。每个技能都是一个包含 `SKILL.md` 文件的目录。

### 如何创建自定义技能？

在 `~/.fermi/skills/` 下创建目录，并放入 `SKILL.md`：

```yaml
---
name: my-skill
description: What this skill does
---

Instructions for the agent when this skill is active.
```

完整指南见[技能](/zh/guide/skills)。

## 故障排查

### "Environment variable 'X' is not set"

Fermi 找不到已配置提供商的 API key。可以：

1. 运行 `fermi init` 重新配置该提供商并设置 key
2. 在 shell 中导出变量：`export ANTHROPIC_API_KEY=sk-ant-...`
3. 直接添加到 `~/.fermi/.env`

### "Unknown provider 'X'"

支持的提供商标识符：`anthropic`、`openai`、`openai-codex`、`copilot`、`openai-chat`、`ollama`、`omlx`、`lmstudio`、`kimi`、`kimi-cn`、`kimi-ai`、`kimi-code`、`glm`、`glm-intl`、`glm-code`、`glm-intl-code`、`minimax`、`minimax-cn`、`deepseek`、`xiaomi`、`qwen`、`qwen-intl`、`qwen-us`、`openrouter`。

### Kimi/GLM coding 端点返回 403

`-code` 端点（kimi-code、glm-code、glm-intl-code）由提供商限制为白名单代理访问。请切换到标准 API 端点（kimi、kimi-cn、glm、glm-intl）。
