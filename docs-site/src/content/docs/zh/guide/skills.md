---
title: "技能"
---

技能是代理可按需加载的可复用提示扩展。它们在不修改核心工具的情况下扩展代理能力。格式遵循 [Agent Skills](https://agentskills.io) 开放标准。

## 使用技能

### 启用/禁用技能

使用 `/skills` 命令打开复选框选择器，启用或禁用已安装技能：

```text
/skills
```

### 安装技能

直接让代理按名称安装技能。内置 `skill-manager` 会处理搜索、下载和安装：

```text
You: install skill: apple-notes
```

代理会：
1. 搜索技能（通过 web search 或已知仓库）。
2. 下载到 staging 区域（`~/.fermi/skills/.staging/`）。
3. 检查并验证技能定义。
4. 移动到 skills 目录。
5. 调用 `reload` 工具，使新技能可用。

### 让变更生效

技能在会话启动时载入。在磁盘上安装、删除或编辑技能后，变更**不会**立即生效，需要重载技能。有三种方式触发重载：

- 代理调用 `reload` 工具（它会从磁盘重新读取 skills、MCP 服务器和系统提示）。skill-manager 会在最后一步替你完成这步。
- 你在 `/skills` 选择器中切换某个技能（这会触发重载）。
- 你开启一个新会话。

重载后技能发生变化时，Fermi 会插入一条简短的 `<system-message>`，说明哪些技能现在可用或已消失——这样代理（和你）无需重读整段提示就能看到新能力。

## 技能目录布局

技能位于 `~/.fermi/skills/`：

```text
~/.fermi/skills/
  skill-name/
    SKILL.md          # 必需：YAML frontmatter + markdown 指令
    scripts/          # 可选：辅助脚本
    references/       # 可选：参考文档
  .staging/           # 临时工作区（不会作为技能加载）
```

## 创建自定义技能

一个技能是包含 `SKILL.md` 文件的目录。该文件由 YAML frontmatter 和 markdown 指令组成。

### SKILL.md 格式

```yaml
---
name: lowercase-hyphenated-name
description: One-line description of when to use this skill
disable-model-invocation: false   # Optional: true = only user can invoke via /name
user-invocable: true               # Optional: false = hidden from / menu, agent-only
---

Markdown instructions here.
```

### Frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 只能包含小写字母、数字和连字符。必须以字母或数字开头。 |
| `description` | 是 | 一行说明：何时应使用该技能。 |
| `disable-model-invocation` | 否 | 若为 `true`，只有用户能通过 `/name` 调用该技能。默认：`false`。 |
| `user-invocable` | 否 | 若为 `false`，技能会从 `/` 菜单隐藏，只能由代理使用。默认：`true`。 |

### 参数

技能可以接收用户参数：

- `$ARGUMENTS` -- 完整参数字符串
- `$ARGUMENTS[0]`、`$ARGUMENTS[1]` 或 `$0`、`$1` -- 位置参数

### 示例

下面是一个用图解释代码的简单技能：

```yaml
---
name: explain-code
description: Explains code with diagrams and step-by-step analysis.
---

When explaining code, follow this structure:

1. **Analogy**: Compare the code's behavior to something from everyday life
2. **Diagram**: Draw an ASCII diagram showing the flow, structure, or relationships
3. **Step-by-step walkthrough**: Walk through what happens at each stage
4. **Common pitfall**: Highlight one non-obvious mistake or misconception

If $ARGUMENTS refers to a specific file, read it first and then explain it.
```

## 管理技能

### 删除技能

让代理删除它，或手动删除目录：

```bash
rm -rf ~/.fermi/skills/skill-name
```

技能会在下次重载后消失（代理的 `reload` 工具、`/skills` 切换，或新会话）。

### 工作流摘要

| 动作 | 方式 |
|------|------|
| 从 GitHub 安装 | 让代理执行："install skill: name" |
| 创建自定义技能 | 在 `~/.fermi/skills/name/` 写入 `SKILL.md` |
| 启用/禁用 | `/skills` 命令 |
| 删除 | 删除目录，然后重载（或开启新会话） |

## 内置 Skill Manager

`skill-manager` 是 Fermi 捆绑的特殊技能。它不是用户可直接调用的技能。相反，当你要求代理查找、安装或管理技能时，它会自动激活。

skill manager 知道如何：
- 通过 web search 搜索技能
- 克隆仓库到 staging 区域
- 检查并验证 SKILL.md 文件
- 将技能从 staging 移动到 active 目录
- 清理 git metadata
- 调用 `reload` 工具使变更生效
