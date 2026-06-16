---
title: "配置"
---

Fermi 会从安装包加载内置默认值，并从 `~/.fermi/` 加载用户覆盖配置。运行 `fermi init` 创建初始配置。

## 目录结构

```text
~/.fermi/
├── settings.json          # 用户设置 (JSONC)：上下文预算、权限、模型固定等
├── .env                   # API key 和托管提供商槽位（0600 权限）
├── mcp.json               # MCP 服务器配置（可选，用户编辑）
├── permissions.json       # 全局权限规则（自动管理）
├── AGENTS.md              # 全局持久记忆
├── state/                 # 自动管理的运行时状态
│   ├── oauth.json         #   OAuth token（ChatGPT + GitHub Copilot）
│   └── model-selection.json  #   已保存的提供商 / 模型 / thinking level 选择
├── projects/              # 按路径哈希划分的每项目托管存储
│   └── <name>_<hash>/.fermi/   #   项目权限、hooks、skills、templates
├── agent_templates/       # 用户添加的代理模板
├── hooks/                 # 用户 hooks（全局）
├── skills/                # 用户技能
└── prompts/               # 用户提示覆盖
```

## settings.json

用户可编辑的设置文件（JSONC 格式）。可手动创建，也可通过 `-c` 覆盖创建。支持全局（`~/.fermi/settings.json`）和项目本地（`<project>/.fermi/settings.json`），本地覆盖全局。

```jsonc
{
  "context_budget_percent": 80,
  "permission_mode": "reversible",
  "default_model": "anthropic:claude-opus-4-6",
  "thinking_level": "high"
}
```

| 设置 | 类型 | 说明 |
|------|------|------|
| `context_budget_percent` | number (1-100) | 有效上下文占模型最大值的百分比。默认：100。 |
| `permission_mode` | string | 默认模式：`read_only`、`reversible` 或 `yolo`。 |
| `default_model` | string | 声明式默认模型（覆盖初始化向导选择）。 |
| `thinking_level` | string | 主代理默认 thinking level。 |
| `model_tiers` | object | 子代理层级：`{ high: {...}, medium: {...}, low: {...} }`。 |
| `sub_agent_inherit_mcp` | boolean | 子代理继承 MCP 服务器。默认：true。 |
| `sub_agent_inherit_hooks` | boolean | 子代理继承 hooks。默认：true。 |
| `disabled_skills` | string[] | 默认禁用的技能。 |
| `accent_color` | string | TUI 强调色的十六进制颜色。 |
| `mcp_servers` | object | MCP 服务器（可替代 mcp.json，支持本地覆盖）。 |
| `auto_update` | boolean \| `"notify"` | 针对 GitHub Releases 的后台更新检查。`true`：patch/minor 自动暂存，major 只通知。`"notify"`：只通知。`false`：禁用检查。可用 `/autoupdate` 切换或直接编辑设置。 |
| `theme_mode` | string | TUI 主题：`auto`、`light` 或 `dark`。默认：`auto`。通过 `/theme` 设置。 |
| `diff_display` | string | 写入/编辑 diff 渲染方式：`compact` 或 `full`。默认：`compact`。通过 `/diff` 设置。 |
| `copy_on_select` | boolean | 用鼠标选中文本时自动复制到剪贴板。默认：true。通过 `/autocopy` 切换。 |
| `summarize_hint` | object | 两级 summarize 提示：`{ enabled, level1, level2 }`。通过 `/summarize_hint` 设置。 |
| `agent_models` | object | 按模板固定子代理模型。 |
| `providers` | object | 云端环境变量绑定和本地提供商配置（base URL、上下文长度）。由 `fermi init` 和 `/model` 自动管理。 |

每次会话可通过 CLI 覆盖：`fermi -c context_budget_percent=70`。

**全局与项目设置如何合并：** 标量值（如 `permission_mode`、`thinking_level`）——项目替换全局；对象（`model_tiers`、`mcp_servers`）——按键合并，项目键胜出；数组（`disabled_skills`）——项目整体替换全局；`providers`——仅全局，项目本地的 `providers` 值会被忽略。

`providers` 键由 `fermi init` 和 `/model` 自动管理，保存提供商/模型选择和本地提供商设置；当前选择也会缓存到 `state/model-selection.json`。建议运行 `fermi init` 或使用 `/model`，不要手动编辑。

## .env

API key 以 `0600` 权限保存。初始化向导会自动创建该文件。

```bash
# Example ~/.fermi/.env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
FERMI_DEEPSEEK_API_KEY=...
FERMI_XIAOMI_API_KEY=...
FERMI_GLM_CODE_API_KEY=...
FERMI_KIMI_API_KEY=...
FERMI_MINIMAX_CN_API_KEY=...
```

对 Kimi、MiniMax、GLM、DeepSeek、Xiaomi 和 Qwen，Fermi 会保存端点专用的托管槽位（例如 `FERMI_QWEN_API_KEY`），并在启动时解析。外部环境变量（例如 `MOONSHOT_API_KEY`、`DASHSCOPE_API_KEY`）只会在 `fermi init` 或 `/model` 因缺少 key 而提示时检测并导入。

OpenAI（ChatGPT Login）和 GitHub Copilot 使用 OAuth 流程，不使用 API key。

## mcp.json

可选。用于配置 MCP 服务器以提供额外工具。该文件需手动创建。

```json
{
  "server-name": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-something"],
    "env": {
      "API_KEY": "${MY_API_KEY}"
    }
  }
}
```

完整参考见 [MCP 集成](/zh/guide/mcp)。

## state/oauth.json

自动管理。保存 ChatGPT 登录流程和 GitHub Copilot 的 OAuth token（位于不同字段）。文件路径为 `~/.fermi/state/oauth.json`。使用 `fermi oauth` 命令管理。

## agent_templates/

把目录放到这里即可添加新的子代理模板：

```text
~/.fermi/agent_templates/
└── my-template/
    ├── agent.yaml
    └── system_prompt.md
```

用户全局模板只能**新增**模板，不能覆盖内置的 `explorer` / `worker` / `reviewer` / `main` 模板。要覆盖内置模板，请将其放到**项目本地** `.fermi/agent_templates/`（项目根目录），该位置优先级最高。

## skills/

用户安装的技能。每个技能都是一个包含 `SKILL.md` 文件的目录：

```text
~/.fermi/skills/
├── explain-code/
│   └── SKILL.md
├── skill-manager/
│   └── SKILL.md
└── .staging/           # 临时工作区（skill loader 会忽略）
```

详情见[技能](/zh/guide/skills)。

## AGENTS.md 文件

两个 `AGENTS.md` 文件提供跨会话持久记忆：

- **`~/.fermi/AGENTS.md`** — 所有项目的全局偏好
- **`<project>/AGENTS.md`** — 项目特定模式和约定

全局文件位于 `~/.fermi/`；项目文件位于项目根目录。它们的内容会加载进系统提示（会话初始化时、以及代理的 `reload` 工具运行时重新读取，例如代理编辑 `AGENTS.md` 之后），因此每轮都可用，代理也可以写入它们。

## CLI Flags

```text
fermi                     # 在当前目录启动会话
fermi init                # 运行设置向导
fermi --version           # 显示版本
fermi --templates <path>  # 使用指定模板目录
fermi --verbose           # 启用调试日志
fermi -c key=value        # 为本次会话覆盖设置
fermi --resume <id>       # 按 ID 恢复指定会话
fermi --model <id>        # 使用指定模型启动
fermi --agent <template>  # 使用指定代理模板启动
fermi update [--check]    # 为下次重启暂存最新 GitHub release
fermi oauth [action] [service]  # 管理 OAuth 登录（Codex / Copilot）
fermi sessions [--json]   # 列出已保存会话
fermi fix                 # 修复损坏的安装/配置
```

## 资源发现优先级

模板、提示、技能和 hooks 按以下顺序发现：

1. **CLI flag**（例如 `--templates`）
2. **Workspace**（当前工作目录下的 `.fermi/`）
3. **Project store**（`~/.fermi/projects/<name>_<hash>/.fermi/`，系统管理的每项目状态）
4. **User-global**（`~/.fermi/`）
5. **Bundled defaults**（安装包内置默认值）

越靠前的层级优先级越高。
