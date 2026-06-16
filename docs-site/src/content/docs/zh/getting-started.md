---
title: "快速开始"
---

用不到一分钟启动 Fermi。三步：安装、配置、启动。

![Fermi TUI — 子代理生成、构建验证和实时上下文统计](/session.png)

**平台：** macOS (Apple Silicon) / Linux (x86_64、arm64) / Windows (x64、arm64)。

## 安装

### macOS (Apple Silicon) / Linux (x86_64、arm64)

```bash
curl -fsSL https://raw.githubusercontent.com/FelixRuiGao/Fermi/main/scripts/install.sh | sh
```

### Windows (x64、arm64)

```powershell
irm https://raw.githubusercontent.com/FelixRuiGao/Fermi/main/scripts/install.ps1 | iex
```

Fermi 是单个自包含二进制文件，不需要 Bun、Node 或其他运行时。安装器会解压到 `~/.fermi/bin/` 并加入 PATH。

> 继续之前请**打开一个新终端**（或运行 `source ~/.zshrc`），因为 PATH 变更不会应用到执行安装器的当前 shell。

## 配置

初始化向导会带你完成提供商选择、API key 配置和模型选择：

```bash
fermi init
```

向导会：

1. 显示支持的提供商（Anthropic、OpenAI、OpenAI ChatGPT Login、GitHub Copilot、DeepSeek、Kimi、MiniMax、GLM、Xiaomi、Qwen、Ollama、oMLX、LM Studio、OpenRouter）。
2. 提示输入 API key 或完成 OAuth 登录。
3. 对本地提供商（Ollama、oMLX、LM Studio）从运行中的服务自动发现可用模型。
4. 让你选择默认模型。

提供商和模型选择会保存到 `~/.fermi/settings.json`（以及 `~/.fermi/state/model-selection.json`）。API key 会以 `0600` 权限保存到 `~/.fermi/.env`。

随时可以重新运行 `fermi init` 来添加提供商或修改默认模型。

## 启动会话

```bash
fermi
```

输入任务并按 Enter。代理会探索、规划并执行。

## 常用命令

| 命令 | 说明 |
|------|------|
| `/model` | 在运行时切换模型/提供商 |
| `/key` | 添加、替换、移除或导入提供商 API key |
| `/summarize` | 压缩较早的上下文以释放空间 |
| `/compact` | 使用延续摘要进行完整上下文重置 |
| `/rewind` | 回滚到之前的轮次（别名：`/undo`） |
| `/session` | 恢复之前的会话（别名：`/resume`） |
| `/permission` | 设置权限模式（read_only / reversible / yolo） |
| `/tier` | 配置子代理模型层级 |
| `/skills` | 启用/禁用已安装技能 |
| `/mcp` | 显示 MCP 服务器状态和工具 |
| `/fork` | 将当前会话 fork 到新分支 |
| `/new` | 启动新会话 |
| `/help` | 显示所有命令和快捷键 |

完整参考见[斜杠命令](/zh/guide/commands)。

## 上下文管理概览

Fermi 通过三层机制管理上下文：

| 层级 | 触发条件 | 发生什么 |
|------|----------|----------|
| **提示压缩** | 上下文达到 50% / 75% | 系统提醒代理总结较早片段（两级递进提示） |
| **代理总结** | 代理决定（或用户运行 `/summarize`） | 代理检查上下文地图，精确压缩选定块 |
| **自动 compact** | 轮次开始前 85% / 轮次进行中 90% | 带延续提示的完整重置，代理可无缝继续 |

以上触发百分比是默认值，可用 `/summarize_hint` 调整。大多数会话中你不需要介入，这三层会自动处理。

详情见[上下文管理](/zh/guide/context)。

## CLI 选项

```text
fermi                       # 使用自动检测的配置启动
fermi init                  # 运行设置向导
fermi update                # 检查 GitHub Releases 并暂存最新版
fermi update --check        # 只检查更新，不暂存
fermi --resume <id>         # 按 ID 恢复指定会话
fermi -c key=value          # 为本次会话覆盖配置
fermi oauth                 # 通过 OAuth 登录（提示选择 Codex 或 Copilot）
fermi oauth status          # 检查 OAuth 登录状态（两个服务）
fermi oauth logout          # 登出（提示选择服务）
fermi sessions              # 列出已保存会话（加 --json 输出机器可读格式）
fermi fix                   # 检查并修复会话存储
fermi --templates <path>    # 使用指定模板目录
fermi --verbose             # 启用调试日志
fermi --version             # 显示版本
```

## 更新

Fermi 会在后台检查 GitHub Releases 是否有新版本（最多每 24 小时一次）。发现新版本后会下载到 `~/.fermi/staged/`，下次启动 `fermi` 时自动应用新二进制。

- `fermi update` — 手动检查并暂存最新版；重启后生效
- `/autoupdate` — 切换后台更新检查（开/关，持久化到全局设置）

## 安全

Fermi 不对 shell 命令或文件编辑做沙箱隔离。它会直接执行命令并写入文件。`/permission` 命令用于设置模式：

- **read_only** — 只有读取工具自动允许，其他都需要批准
- **reversible** — 读取 + 可逆写入自动允许
- **yolo** — 除灾难性操作外全部自动允许

## 持久记忆

两个 `AGENTS.md` 文件会被折叠进系统提示（每轮都存在），并在 compact 重置后保留：

- **`~/.fermi/AGENTS.md`** — 所有项目的全局偏好
- **`<project>/AGENTS.md`** — 项目特定模式、约定和决策

代理会自动读取这些文件；当你要求它为未来会话保存知识时，它也可以写入这些文件。

## 下一步

- [上下文管理](/zh/guide/context) — 深入了解核心功能
- [提供商](/zh/providers/) — 设置云端或本地模型提供商
- [子代理](/zh/guide/sub-agents) — 会话内的并行工作代理
- [配置](/zh/configuration) — `~/.fermi/` 完整参考
