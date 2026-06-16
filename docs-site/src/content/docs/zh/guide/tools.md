---
title: "工具参考"
---

Fermi 提供 13 个内置工具和 9 个编排工具。额外工具来自[技能](/zh/guide/skills)和 [MCP 服务器](/zh/guide/mcp)。

## 内置工具（13）

### 文件操作

| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件内容。在多模态模型上支持图片（PNG、JPEG、GIF、WebP、BMP、SVG、ICO、TIFF）。 |
| `write_file` | 写入内容，不存在时创建文件。 |
| `edit_file` | 定向查找替换编辑。支持 `append_str` 追加。 |
| `list_dir` | 列出目录内容。 |
| `glob` | 按 glob 模式查找文件（例如 `**/*.ts`）。 |
| `grep` | 使用正则表达式搜索文件内容。 |

### Shell

| 工具 | 说明 |
|------|------|
| `bash` | 运行 shell 命令，需提供必填 `timeout`（1–600 秒）。若命令未在时限内完成，会**移交给后台 shell**（不杀掉），而非截断输出。每个 stream 200KB 输出上限。 |
| `bash_background` | 在后台运行 shell 命令。返回用于跟踪的 shell ID。 |
| `bash_output` | 读取后台 shell 进程输出。 |
| `kill_shell` | 杀掉运行中的后台 shell 进程。 |

### 实用工具

| 工具 | 说明 |
|------|------|
| `time` | 返回当前本地时间、时区和 UTC offset。 |

### Web

| 工具 | 说明 |
|------|------|
| `web_search` | 搜索网页。可用时使用提供商原生搜索；客户端 fallback 返回带编号 URL、highlight 和可用 metadata 的结果。 |
| `web_fetch` | 获取并读取 URL 内容。优先使用 Jina Reader，然后对 HTML 页面使用本地 Readability/Turndown fallback，返回可读页面内容。 |

## 编排工具（9）

### 上下文管理

| 工具 | 说明 |
|------|------|
| `show_context` | 显示上下文分布地图。展示所有上下文分组的大小和类型。启用行内注释，直到关闭。 |
| `summarize_context` | 总结连续上下文 ID 分组。提取有价值信息并丢弃其余内容。粒度可从单个工具结果到多个轮次。 |

### 子代理管理

| 工具 | 说明 |
|------|------|
| `spawn` | 使用内联参数生成子代理。见[子代理](/zh/guide/sub-agents)。 |
| `send` | 向 persistent 子代理发送消息。异步送达。 |
| `kill_agent` | 按 ID 杀掉一个或多个运行中的子代理。 |
| `check_status` | 查看子代理状态和后台 shell 状态。 |
| `await_event` | 暂停直到运行时事件到达（子代理完成、消息、shell 退出）或超时。 |

### 用户交互

| 工具 | 说明 |
|------|------|
| `ask` | 向用户提出 1-4 个结构化问题，每个问题 1-4 个选项。用于代理在继续前需要决策的场景。 |

### 配置

| 工具 | 说明 |
|------|------|
| `reload` | 从磁盘重新读取 skills、MCP 服务器和系统提示并按差异应用。代理在编辑 `SKILL.md`、`AGENTS.md` 或 MCP 配置后调用。返回变更摘要。 |

## 技能

启用技能后，会出现一个动态 `skill` 工具。它会分派到当前激活技能的指令。使用 `/skills` 管理技能，或让代理安装新技能。

详情见[技能](/zh/guide/skills)。

## MCP 工具

MCP 服务器提供配置在 `~/.fermi/mcp.json` 中的额外工具。它们会自动和内置工具一起出现。

详情见 [MCP 集成](/zh/guide/mcp)。

## 工具安全

Fermi 不对工具执行做沙箱隔离。`bash` 工具直接运行命令，文件工具直接写磁盘。使用 `/permission` 命令控制哪些操作自动允许：

| 模式 | 自动允许 |
|------|----------|
| `read_only` | 读取和非变更工具（read_file, list_dir, glob, grep, web_fetch, web_search, show_context, summarize_context, ask 等） |
| `reversible` | 读取工具 + 可逆写入（edit_file, write_file，包含覆盖写入） |
| `yolo` | 除灾难性操作外全部允许 |

权限系统使用 tree-sitter 解析 bash 命令，并按风险等级分类。

详情见[权限与 Hooks](/zh/guide/permissions)。
