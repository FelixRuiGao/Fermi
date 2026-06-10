---
title: "子代理"
---

Fermi 可以在一个会话中生成并行子代理。每个子代理都有自己的上下文窗口和工具访问权限，与主代理并发运行，并在完成后把结果报告回来。

每个子代理在 TUI 中都有独立标签页。点击主对话中的代理名称，或使用 `Opt+←/→` 在标签页间切换。子代理的完整对话，包括工具调用、diff、bash 输出，都会显示在自己的可滚动视图中。

![子代理详情页 — 带独立标签、状态和计划 todos 的完整 review 输出](/sub-agent-page.png)

## 工作原理

1. 主代理调用 `spawn`，用任务创建子代理。
2. 子代理在自己的上下文中运行，执行工具并产出结果。
3. 完成后，结果会送回主代理。
4. 主代理综合结果并继续。

## `spawn` 工具

```text
spawn(id, task, mode, template?, template_path?, model_level?)
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一 agent ID |
| `task` | 是 | 任务描述 |
| `mode` | 是 | `oneshot`（单轮，返回结果）或 `persistent`（保持存活，接收消息） |
| `template` | 否 | 内置模板：`explorer`、`executor`、`reviewer` |
| `template_path` | 否 | 自定义模板目录路径 |
| `model_level` | 否 | `high`、`medium` 或 `low`，从用户配置的层级中选择 |

## 模板

三个模板可通过 `spawn` 工具的 `template` 参数生成：

### `explorer`

只读。可以读文件、搜索、grep 和浏览，但不能编辑文件或运行破坏性命令。适合调查、代码评审和研究。

### `executor`

面向任务。拥有文件编辑和 shell 访问权限，范围限定为完成特定任务。适合实现工作。

### `reviewer`

验证模板。设计用于检查其他代理产出的工作。适合代码评审和正确性检查。

第四个模板 **`main`** 是主代理模板（你直接对话的顶层代理）。它不是生成目标，子代理使用 `explorer`、`executor` 或 `reviewer`。

## 代理模式

### Oneshot

代理运行一次，产出结果，然后终止。结果会自动传给父代理。

```text
spawn(id="auth-check", template="explorer", mode="oneshot", task="Check how auth middleware validates tokens")
```

### Persistent

代理在初始任务后继续存活。父代理可以通过 `send` 工具发送后续消息。适合长期协调。

```text
spawn(id="monitor", mode="persistent", task="Watch the build output and report errors")
send(to="monitor", content="The build started — check for type errors")
```

## 模型层级

子代理可以通过 `model_level` 参数运行在更便宜/更快的模型上。用 `/tier` 命令配置层级：

```text
/tier
```

这会打开选择器，让你为 high、medium、low 层级分配具体模型。然后生成时：

```text
spawn(id="scout", template="explorer", mode="oneshot", model_level="low", task="List all .ts files in src/")
```

子代理会使用分配给 "low" 层级的模型，为简单任务节省成本。

## 编排工具

| 工具 | 说明 |
|------|------|
| `spawn` | 使用内联参数创建子代理 |
| `send` | 向 persistent 子代理发送消息 |
| `kill_agent` | 按 ID 杀掉一个或多个运行中的子代理 |
| `check_status` | 查看子代理状态和后台 shell 状态 |
| `await_event` | 暂停直到运行时事件到达或超时 |

## 自定义模板

把目录放到 `~/.fermi/agent_templates/` 即可添加新模板：

```text
~/.fermi/agent_templates/
└── my-custom-template/
    ├── agent.yaml
    └── system_prompt.md
```

用户全局模板只能**新增**模板，不能覆盖内置的 `explorer` / `executor` / `reviewer` / `main` 模板（与内置名称冲突的目录会被跳过）。要覆盖内置模板，请将其放到**项目本地** `.fermi/agent_templates/`（项目根目录），该位置优先级最高。

## 实用建议

- **调查时用 `explorer`。** 当你希望代理查看内容但不修改时，它更安全，也占用更少上下文。
- **用 `model_level` 节省成本。** 简单任务（列文件、grep）不需要最贵模型。
- **优先使用 `oneshot` 模式**，除非你需要持续和子代理交互。
- **让主代理决定。** 描述你想完成什么，代理会选择何时生成、如何拆分、使用哪个模板。
- **询问主代理检查进度。** 它会使用 `check_status` 汇报。
