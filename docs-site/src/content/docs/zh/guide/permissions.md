---
title: "权限与 Hooks"
---

Fermi 提供两套系统控制代理行为：权限系统用于限制工具执行，hook 系统允许你在运行时事件发生时执行自定义命令。

## 权限模式

会话中用 `/permission` 设置模式：

| 模式 | 自动允许 | 需要批准 |
|------|----------|----------|
| `read_only` | 读取操作（read_file, list_dir, glob, grep） | 所有写入和 shell 命令 |
| `reversible` | 读取 + 可逆写入（edit_file, write_file 到新文件） | 破坏性操作 |
| `yolo` | 除灾难性操作外全部允许 | rm -rf、force push 等 |

### 分类如何工作

权限系统使用 tree-sitter 解析 bash 命令，并按风险层级分类：

- **read** — ls, cat, grep, git status
- **write_reversible** — mkdir, cp, git add
- **write_potent** — rm（单个文件）、mv、git commit
- **write_danger** — rm -rf、git push --force、作用于宽泛路径的操作
- **catastrophic** — dd 写设备文件、rm 目标为 / 或 $HOME（即使 yolo 模式也始终需要批准）

文件工具按操作类型分类：`read_file` 始终是 read，`edit_file` 是 write_reversible，`bash` 取决于命令内容。

### 权限规则

你可以保存规则以避免重复批准提示。系统请求批准时，会提供记住选择的选项。规则有四个作用域：

- **session** — 内存中，仅当前会话
- **workspace** — 用户编写，`<project>/.fermi/permissions.json`
- **project** — 系统管理，`~/.fermi/projects/<slug>/permissions.json`
- **global** — `~/.fermi/permissions.json`，应用于所有项目

## Hooks

Hooks 是响应运行时事件执行的 shell 命令。它们可用于自定义自动化、验证和上下文注入。

### 支持的事件

| 事件 | 何时触发 | 能否决策 |
|------|----------|----------|
| `SessionStart` | 会话开始 | 是（fail-closed） |
| `SessionEnd` | 会话结束 | 否 |
| `UserPromptSubmit` | 用户发送消息 | 是 |
| `PreToolUse` | 工具执行前 | 是 |
| `PostToolUse` | 工具成功后 | 否 |
| `PostToolUseFailure` | 工具失败后 | 否 |
| `SubagentStart` | 子代理生成 | 否 |
| `SubagentStop` | 子代理结束 | 否 |
| `Stop` | 代理轮次结束 | 否 |

### 决策事件

决策事件（`UserPromptSubmit`、`PreToolUse`）上的 hooks 可通过返回 JSON `decision` 字段批准或拒绝动作。如果 hook 拒绝，该动作会被阻止。

### 上下文注入

`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse` 和 `PostToolUseFailure` 上的 hooks 可以通过 `additionalContext` 字段注入额外上下文。该上下文会包含在代理下一次提示中。（其他事件：`SessionEnd`、`SubagentStart`、`SubagentStop`、`Stop` 不支持上下文注入。）

### 输入更新

`PreToolUse` 上的 hooks 可以在执行前通过 `updatedInput` 字段修改工具参数。

### 配置

Hooks 位于 `~/.fermi/hooks/`（全局）、`<project>/.fermi/hooks/`（项目作用域）或 `~/.fermi/projects/<slug>/.fermi/hooks/`（系统管理的每项目存储）的子目录中。每个 hook 是一个包含 `hook.json` manifest 的目录：

```json
{
  "name": "my-hook",
  "type": "command",
  "event": "PreToolUse",
  "command": "/path/to/script.sh",
  "failClosed": true
}
```

可选字段：`args`（字符串数组）、`env`（键值）、`matcher`（按工具名或 agent ID 过滤）、`timeoutMs`（默认 10000）、`disabled`。

当 `failClosed` 为 true 时，hook 失败（崩溃、超时）会被视为拒绝。支持事件：SessionStart、UserPromptSubmit、PreToolUse。

### 查看 Hooks

会话中使用 `/hooks` 查看所有已注册 hooks 及其配置。
