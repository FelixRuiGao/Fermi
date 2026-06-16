---
title: "斜杠命令"
---

斜杠命令在会话输入框中直接输入。它们控制上下文、模型、权限和会话生命周期。

## 命令参考

| 命令 | 别名 | 说明 |
|------|------|------|
| `/help` | | 显示命令和快捷键 |
| `/model` | | 在已配置模型之间切换 |
| `/key` | | 添加、替换、移除或导入提供商 API key |
| `/tier` | | 配置子代理模型层级（high/medium/low） |
| `/permission` | | 设置权限模式（read_only / reversible / yolo） |
| `/summarize` | | 交互式总结较早上下文 |
| `/summarize_hint` | | 配置两级 summarize 提示（开/关、触发百分比） |
| `/compact` | | 使用延续摘要完整重置上下文 |
| `/rewind` | `/undo` | 回退到之前轮次（还原对话 + 文件） |
| `/review` | | 评审代码变更（base branch / uncommitted / commit / custom） |
| `/session` | `/resume` | 恢复之前的会话 |
| `/new` | | 开始新会话 |
| `/fork` | | 将当前会话 fork 到新分支 |
| `/rename` | | 重命名当前会话 |
| `/shells` | | 查看并停止后台 shell |
| `/usage` | `/context` | 显示当前会话的 token 用量 |
| `/stat` | | 显示历史累计 token 统计 |
| `/autoupdate` | | 切换后台更新检查 |
| `/autocopy` | | 切换选中即复制（自动复制选区文本） |
| `/skills` | | 启用/禁用技能（复选框选择器） |
| `/mcp` | | 管理 MCP 服务器并列出工具 |
| `/agents` | | 切换 agents 面板 |
| `/todos` | | 切换 todo 面板 |
| `/theme` | | 设置主题模式（auto / light / dark） |
| `/diff` | | 设置写入/编辑 diff 显示（compact / full） |
| `/codex` | | OpenAI ChatGPT OAuth 登录 |
| `/copilot` | | GitHub Copilot 登录 |
| `/hooks` | | 管理已注册 hooks |
| `/copy` | | 复制代理最近一次文本回复 |
| `/raw` | `/md` | 切换 markdown 原始/渲染模式 |
| `/quit` | `/exit` | 退出应用 |

每个已启用、用户可调用的技能也会作为各自的 `/<skill-name>` 命令出现。输入 `/` 即可看到完整列表——内置命令和技能一起显示。

## 上下文命令

### `/summarize`

打开交互式范围选择器：

1. 选择**起始**轮次
2. 选择**结束**轮次
3. 可选提供**focus prompt**，说明需要保留什么

选定范围会转换为上下文 ID 并被总结。关键决策和发现会保留，其余内容会丢弃。

```text
/summarize
```

详情见[上下文管理](/zh/guide/context)。

### `/compact`

使用延续摘要完整重置上下文。可选提供指令：

```text
/compact
/compact Preserve the DB schema decisions
```

compact 后，代理会从新的上下文窗口开始，其中只包含延续摘要和 AGENTS.md 文件。

### `/summarize_hint`

配置两个随上下文填满而提醒代理总结的自动提示。可开关，或设置自定义触发百分比：

```text
/summarize_hint on
/summarize_hint off
/summarize_hint 50 75
```

两个整数分别是 Level 1 和 Level 2 的触发百分比，须满足 `0 < level1 < level2 < 85`。设置会持久化。见[上下文管理](/zh/guide/context)。

### `/rewind`

回滚到之前的轮次。会打开显示轮次历史的选择器。它会同时回退**对话**和该轮之后产生的文件系统变更。

```text
/rewind
```

文件回退使用已跟踪变更（edits、writes、bash mkdir/cp/mv），并带冲突检测。如果某个文件在代理修改后又被外部修改，rewind 会跳过该文件并报告冲突。

### `/review`

运行代码评审。打开选择器决定评审对象：

```text
/review
```

- **Against a base branch** — 评审与 base branch 的 diff
- **Uncommitted changes** — 评审当前工作区变更
- **A commit** — 按 SHA 评审指定 commit
- **Custom instructions** — 提供自定义评审重点

也可以直接传入指令：`/review 检查 SQL 注入风险`。选择器中按 Tab 可为任意选项附加额外说明。

## 模型命令

### `/model`

打开层级选择器，显示所有已配置提供商和模型。选择一个后立即切换。

对缺少 API key 的托管提供商（Kimi、MiniMax、GLM、DeepSeek、Xiaomi、Qwen），选择模型时可以现场提示你粘贴或导入 key。

### `/key`

直接管理某个提供商的 API key——添加、替换、移除，或导入检测到的外部环境变量。会打开提供商端点选择器，再选择动作。Key 保存在 `~/.fermi/.env`（`0600`）。这是无需重新运行 `fermi init` 就能轮换或修正 key 的最快方式。

### `/tier`

配置子代理在每个层级（high、medium、low）使用的模型。当代理用 `model_level="low"` 生成子代理时，会使用你分配给 low 层级的模型。

## 权限与安全

### `/permission`

设置工具执行的权限模式：

| 模式 | 行为 |
|------|------|
| `read_only` | 只有读取工具自动允许；所有写入需要批准 |
| `reversible` | 读取 + 可逆写入自动允许 |
| `yolo` | 除灾难性操作外全部自动允许 |

### `/autoupdate`

切换后台更新检查：

```text
/autoupdate on
/autoupdate off
```

启用后，Fermi 会在后台检查 GitHub Releases，自动暂存 patch/minor 更新，并在下次重启时应用。

### `/hooks`

显示所有已注册 hooks 及其配置。Hooks 是响应事件（PreToolUse、PostToolUse、UserPromptSubmit 等）运行的 shell 命令。

## 会话命令

### `/session`

恢复之前的会话。显示带时间戳的已保存会话列表。选择一个即可恢复完整对话状态。

```text
/session
/session <id>
```

### `/new`

开始新会话。当前会话会先自动保存。

### `/fork`

把当前会话 fork 成新分支，也就是复制当前状态，然后你可以朝另一个方向继续。

### `/rename`

给当前会话起一个描述性名称，方便在会话列表中识别。

## 其他命令

### `/skills`

打开复选框选择器，用于启用或禁用已安装技能。技能从多个根目录载入：全局（`~/.fermi/skills/`）、项目（`<project>/.fermi/skills/`）和每项目存储——在此切换会立即重载。

### `/mcp`

连接已配置 MCP 服务器并列出发现的工具。适合作为开始工作前的健康检查。

### `/agents`

切换 agents 面板，显示主代理以及任何运行中的子代理和状态。

### `/todos`

切换 todo 面板，显示代理当前计划/任务列表。

### `/theme`

设置 TUI 主题模式：`auto`、`light` 或 `dark`。持久化到 `settings.json`（`theme_mode`）。

### `/diff`

设置写入/编辑 diff 的渲染方式：`compact` 或 `full`。持久化到 `settings.json`（`diff_display`）。

### `/codex` / `/copilot`

分别用于 OpenAI (ChatGPT) 和 GitHub Copilot 的 OAuth 登录流程。

### `/copy`

把代理最近一次文本回复复制到系统剪贴板。

### `/raw`

在渲染后的 markdown 和原始 markdown 显示之间切换。也可用 `/md`。

### `/shells`

查看被跟踪的后台 shell 并停止它们。后台 shell 来自 `bash_background`，或某个 `bash` 调用超出超时后被移交到后台。

### `/usage` 与 `/stat`

`/usage`（别名 `/context`）显示当前会话的 token 用量——上下文预算消耗了多少，以及按类别的明细。`/stat` 显示你跨所有会话的历史累计 token 统计。

### `/autocopy`

切换选中即复制。开启后，用鼠标选中文本会自动复制到剪贴板（带短暂 toast），无需单独的复制步骤。

```text
/autocopy on
/autocopy off
```

## 键盘快捷键

| 快捷键 | 动作 |
|--------|------|
| Enter | 发送消息 |
| Option+Enter / Ctrl+N | 插入换行 |
| ↑ / ↓ | 浏览提示历史 |
| Ctrl+Q | 循环切换权限模式 |
| Ctrl+V | 粘贴图片 |
| Ctrl+G | 切换 markdown 原始视图 |
| PageUp / PageDown | 滚动半页 |
| Opt+← / → | 在 agent tabs 间切换 |
| Ctrl+X | 杀掉所有子代理 |
| Ctrl+K | 杀掉所有后台 shells |
| Alt+Backspace / Ctrl+W | 删除前一个单词 |
| Cmd+Delete | 删除到行首（Ghostty/kitty protocol） |
| Ctrl+C | 取消 / 退出 |
| @filename | 附加文件 |
