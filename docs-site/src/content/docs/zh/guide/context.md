---
title: "上下文管理"
---

Fermi 的上下文管理是支持长会话的核心功能。系统不会等到触及上下文限制后盲目重置，而是持续监控用量、策略性压缩，并只在最后关头重置。代理可以检查自己的上下文分布，并精确总结选定块，粒度可以小到单个工具调用结果。

## 三层机制

### 1. 提示压缩

随着上下文增长，系统会在两个阈值注入提示：

| 级别 | 默认触发 | 代理看到什么 |
|------|----------|--------------|
| Level 1 | 预算的 50% | 提醒调用 `show_context`，考虑总结较早分组 |
| Level 2 | 预算的 75% | 更强提示，要求在 auto-compact 触发前立即总结 |

Hysteresis 会防止来回震荡：提示触发后，只有上下文明显下降，才会再次触发。

可用 `/summarize_hint` 命令调整或关闭这些触发点——`/summarize_hint on | off | <level1> <level2>`，两个整数需满足 `0 < level1 < level2 < 85`。改动会持久化到设置。

### 2. 代理发起总结

代理有两个工具可进行精细上下文控制：

#### `show_context`

返回自包含的上下文地图，列出所有上下文分组及其 ID、大小和类型。它不会向现有对话注入内容（保护 prompt cache），地图本身会告诉代理每个上下文 ID 覆盖什么。

#### `summarize_context`

作用于空间上连续的上下文 ID 分组。对每个分组，代理会写出压缩摘要，保留决策、关键事实、代码引用和未解决问题，然后原始内容会被摘要替换。

关键属性：这是 **append-only**。原始内容从不删除，摘要会追加，系统根据已总结内容动态决定哪些内容可见。这意味着总结在系统层面是安全且可逆的。

`summarize_context` 目标是具体范围。达到上下文限制时的整窗重置由 auto-compact 负责（这是独立机制，也通过用户命令 `/compact` 暴露）。

### 3. Auto-Compact

当提示和总结仍无法阻止上下文达到关键水位时：

| 触发点 | 默认阈值 | 何时触发 |
|--------|----------|----------|
| Before-turn | 85% | 处理下一条用户消息前 |
| Mid-turn | 90% | 工具调用结果把上下文推过限制后 |

Auto-compact 会生成延续提示，即一份完整 briefing，让代理从刚才离开的地方准确继续。compact 后，上下文窗口只包含：
- 延续提示
- 当前计划快照（如果有活动计划）
- AGENTS.md 文件（持久记忆）

Before-turn compact 可以中断：按 Ctrl+C 会取消 compact 并保留原上下文。

## 用户总结 vs. 代理总结

| | `/summarize`（用户） | `summarize_context` 工具（代理） |
|---|---|---|
| **触发** | 用户运行斜杠命令 | 代理自主决定（或被提示触发） |
| **选择** | 交互式选择器：选择起止轮次范围 | 代理检查地图后选择上下文 ID |
| **重点** | 可选 focus prompt（"Keep the auth details"） | 代理直接写摘要 |
| **粒度** | 轮次级范围 | 可针对单个工具结果 |

<!-- MEDIA: Screen recording of /summarize interactive picker — selecting turns, providing focus prompt -->

## 上下文预算

你可以在不切换模型的情况下限制有效上下文大小。在 `~/.fermi/settings.json`（或 `<project>/.fermi/settings.json` 的项目级覆盖）中：

```jsonc
{
  "context_budget_percent": 70
}
```

这会把有效预算设为模型最大上下文长度的 70%。所有阈值计算（提示、compact）都会基于该预算。适合想为大型工具结果预留余量的场景。

也可以通过 CLI 为单次会话设置：`fermi -c context_budget_percent=70`。

## 手动介入

### `/summarize`

打开交互式选择器：

1. **选择起始轮次** — 选择从哪里开始总结
2. **选择结束轮次** — 选择到哪里结束
3. **Focus prompt**（可选）— 说明要保留什么

选定范围会转换为上下文 ID 并总结。

```text
/summarize
```

### `/compact`

使用延续摘要完整重置上下文。可选提供指令：

```text
/compact
/compact Preserve the DB schema decisions
```

## AGENTS.md — 持久记忆

两个 `AGENTS.md` 文件会折叠进系统提示（因此每轮都存在）并在 compact 后保留：

- **`~/.fermi/AGENTS.md`** — 所有项目的全局偏好
- **`<project>/AGENTS.md`** — 项目特定模式和约定

它们在会话初始化时、以及代理的 `reload` 工具运行时读取（例如代理编辑 `AGENTS.md` 之后）。代理会读取这些内容作为上下文，也可以写入以保存长期知识。可用 AGENTS.md 存储架构决策、编码约定、已知约束和偏好做法。

## 实用建议

- **让系统工作。** 大多数会话中，三层自动机制会处理一切。
- **探索后使用 `/summarize`。** 长时间调查得出结论后，总结探索过程，为执行释放空间。
- **提供 focus prompt。** 告诉总结器什么重要，会让压缩更有效。
- **调整 `context_budget_percent`**，如果你经常因大文件或大量工具结果触及限制。
- **写入 AGENTS.md** 保存需要跨会话保留的知识，代理可以代你完成。
