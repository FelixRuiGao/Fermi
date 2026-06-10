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
5. 下一轮开始技能自动可用。

### 自动发现

技能会在每一轮自动从磁盘发现。安装、删除或修改技能会立即生效，不需要手动 reload。

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

下一轮会自动识别该技能已被删除。

### 工作流摘要

| 动作 | 方式 |
|------|------|
| 从 GitHub 安装 | 让代理执行："install skill: name" |
| 创建自定义技能 | 在 `~/.fermi/skills/name/` 写入 `SKILL.md` |
| 启用/禁用 | `/skills` 命令 |
| 删除 | 删除目录（下一轮自动检测） |

## 内置 Skill Manager

`skill-manager` 是 Fermi 捆绑的特殊技能。它不是用户可直接调用的技能。相反，当你要求代理查找、安装或管理技能时，它会自动激活。

skill manager 知道如何：
- 通过 web search 搜索技能
- 克隆仓库到 staging 区域
- 检查并验证 SKILL.md 文件
- 将技能从 staging 移动到 active 目录
- 清理 git metadata
- 自动激活变更（技能每轮自动发现）
