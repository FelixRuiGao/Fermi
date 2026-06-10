---
title: "MCP 集成"
---

Fermi 支持 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)，可连接外部工具服务器。MCP 服务器提供额外工具，代理可以和内置工具一起使用。

## 配置

MCP 服务器可在多个位置配置（全部可选，全部由用户编辑，`fermi init` 不会创建）：

- **`~/.fermi/mcp.json`** — 全局 MCP 服务器
- **`<project>/.mcp.json`** — 项目本地 MCP 服务器
- **`settings.json` 中的 `mcp_servers` 键** — 全局或项目本地，支持本地覆盖

下面示例使用 `mcp.json`。JSON 文件中也接受嵌套的 `{ "mcpServers": { ... } }` 包装。

### 格式

文件是一个 JSON 对象，每个 key 是服务器名，每个 value 是服务器配置：

```json
{
  "filesystem": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
  },
  "github": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

### 配置字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `transport` | `"stdio"` 或 `"sse"` | 否 | 传输协议。默认：`"stdio"`。 |
| `command` | string | 是（stdio） | 运行 MCP 服务器的命令。 |
| `args` | string[] | 否 | 传给命令的参数。 |
| `url` | string | 是（sse） | SSE transport 服务器的 URL。 |
| `env` | object | 否 | 传给服务器进程的环境变量。支持 `${VAR}` 语法引用 shell 环境。 |
| `env_allowlist` | string[] | 否 | 从父进程透传的环境变量名列表。 |
| `sensitive_tools` | string[] | 否 | 应被视为敏感的工具名（可能需要额外确认）。 |

### 环境变量解析

`env` 字段中的环境变量支持 `${VAR}` 语法：

```json
{
  "env": {
    "API_KEY": "${MY_API_KEY}"
  }
}
```

启动时会从 shell 环境解析 `${MY_API_KEY}`。如果变量未设置，Fermi 不会失败：对 `mcp.json` 会警告并跳过该变量，对 `settings.json` 会静默省略，服务器仍会在没有该变量的情况下启动。

## 传输类型

### stdio（默认）

最常见的传输方式。Fermi 会把 MCP 服务器作为子进程启动，并通过 stdin/stdout 通信。

```json
{
  "my-server": {
    "transport": "stdio",
    "command": "node",
    "args": ["path/to/server.js"]
  }
}
```

### SSE

用于以独立 HTTP 服务运行的服务器。Fermi 会连接服务器的 SSE endpoint。

```json
{
  "remote-server": {
    "transport": "sse",
    "url": "http://localhost:3000/sse"
  }
}
```

## 使用 MCP 工具

配置完成后，MCP 工具会自动对代理可用，并与内置工具一起出现。你不需要做额外操作，代理会按需发现并调用 MCP 工具。

也可以在 Fermi 内运行 `/mcp`，按需连接已配置服务器并列出发现的工具。这可以在第一轮代理动作前执行，是快速验证配置的好方法。

## 示例：添加数据库工具

```json
{
  "sqlite": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sqlite", "path/to/database.db"]
  }
}
```

保存到 `~/.fermi/mcp.json` 并重启 Fermi 后，运行 `/mcp` 验证 SQLite 工具已被发现。之后代理即可在正常轮次中调用它们。
