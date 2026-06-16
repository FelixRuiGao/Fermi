---
title: "模型切换"
---

Fermi 允许你在会话中的任何时刻切换模型。Thinking level 会作为模型切换流程的一部分配置。

## `/model` 命令

在会话中输入 `/model` 打开层级选择器：

```text
/model
```

选择器会显示所有已配置提供商及其模型。选中一个后，代理会立即在会话剩余部分切换到该模型。

对托管提供商（Kimi、MiniMax、GLM、DeepSeek、Xiaomi、Qwen），如果你选择的模型缺少 key，Fermi 可以提示你导入检测到的外部环境变量或直接粘贴 key。

## 管理 API Key

`/model` 流程只在 key 缺失时才提示输入。要直接管理 key——随时添加、替换、移除或导入某个提供商的 API key——请用 `/key`：

```text
/key
```

它会打开提供商端点的选择器；选中一个后再选择动作。Key 保存在 `~/.fermi/.env`（`0600` 权限）。这是轮换 key、或修正输错的 key 的最便捷方式，无需重新运行 `fermi init`。

`/model` 命令本身适用于：
- 探索阶段从快/便宜的模型开始，然后切换到更强模型实现
- 任务变得常规后切换到更便宜模型
- 测试不同模型如何处理同一上下文

## Thinking Levels

切换模型后，Fermi 会提示你选择 thinking level（如果模型支持多个级别）。可用级别因提供商而异：

| 提供商 | 级别 |
|--------|------|
| **Anthropic (Opus 4.7)** | off, low, medium, high, xhigh, max |
| **Anthropic (Opus 4.6)** | off, low, medium, high, max |
| **Anthropic (Sonnet 4.6)** | off, low, medium, high |
| **Anthropic (Haiku 4.5)** | off, low, medium, high |
| **OpenAI** | none, low, medium, high, xhigh |
| **DeepSeek** | off, high, max |
| **Kimi** | off, on |
| **GLM** | off, on |
| **Xiaomi (MiMo)** | off, on |
| **Qwen** | off, on |
| **MiniMax** | on（M3 还支持 off） |
| **GitHub Copilot** | 跟随底层模型的级别 |

部分较新模型与其提供商的通用规律不同：**GLM-5.2** 用 `high` / `max`，**Kimi K2.7 Code** 仅 `on`，**Kimi K2 Instruct** 没有 thinking 控制。选择器始终显示每个模型实际支持的级别。

更高 reasoning depth 会产生更充分的分析，但会使用更多 token 并花更长时间。

## 子代理模型层级

使用 `/tier` 配置子代理在不同能力层级使用的模型：

```text
/tier
```

它会打开选择器，让你为三个层级分配具体模型：

| 层级 | 典型用途 |
|------|----------|
| **high** | 复杂推理、架构决策 |
| **medium** | 标准实现工作 |
| **low** | 简单任务：列文件、grep、基础编辑 |

当代理用 `model_level="low"` 生成子代理时，会使用分配给 low 层级的模型。这可以在常规工作上节省成本，同时让主代理保持在强模型上。

## 添加更多模型

模型来自你在 `fermi init` 中配置的提供商。要添加更多：

1. 重新运行 `fermi init` 添加新提供商
2. 对本地提供商，启动服务器并重新运行 init 以发现新模型
3. 对 OpenRouter，可使用其 API 提供的任意模型

对 OpenAI（ChatGPT Login），使用 `fermi oauth` 或 `/codex` 认证。对 GitHub Copilot，先用 `/copilot` 登录。
