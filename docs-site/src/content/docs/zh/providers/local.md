---
title: "本地提供商"
---

Fermi 支持三个本地推理服务器：Ollama、oMLX 和 LM Studio。它们在你的硬件上运行模型，不需要 API key。

## 本地提供商如何工作

所有本地提供商都使用 OpenAI 兼容的 Chat Completions API。运行 `fermi init` 时，向导会查询服务器的 `/v1/models` 端点来自动发现可用模型。

与云端提供商的关键区别：

- **不需要 API key** — 向导会跳过 key 提示
- **动态模型发现** — 设置时从运行中的服务器获取模型
- **禁用 Web search** — 本地模型没有原生 web search 支持
- **手动设置上下文长度** — 本地模型不一定报告上下文窗口，因此可在初始化时指定

## Ollama

[Ollama](https://ollama.com/) 在本地运行开放权重模型。

**默认 URL：** `http://localhost:11434/v1`

### 设置

1. 安装 Ollama 并拉取至少一个模型：
   ```bash
   # Install Ollama (macOS)
   brew install ollama

   # Pull a model
   ollama pull llama3.1
   ```

2. 启动 Ollama 服务器：
   ```bash
   ollama serve
   ```

3. 运行 `fermi init` 并选择 **Ollama (Local)**。

4. 向导会查询 `http://localhost:11434/v1/models` 并显示可用模型。选择一个。

5. 按提示输入模型上下文长度（例如 Llama 3.1 的 128000）。

## oMLX

[oMLX](https://github.com/nicholasgasior/omlx) 为 Apple Silicon Mac 提供 MLX 优化模型服务。

**默认 URL：** `http://localhost:8000/v1`

### 设置

1. 使用你偏好的 MLX 模型安装并启动 oMLX。

2. 运行 `fermi init` 并选择 **oMLX (Local)**。

3. 向导会从 `http://localhost:8000/v1/models` 发现模型。选择一个。

4. 按提示输入模型上下文长度。

## LM Studio

[LM Studio](https://lmstudio.ai/) 是用于本地运行 GGUF 模型的桌面应用。

**默认 URL：** `http://localhost:1234/v1`

### 设置

1. 下载并安装 LM Studio。

2. 在 LM Studio 中加载模型，并在 "Local Server" 标签页启动本地服务器。

3. 运行 `fermi init` 并选择 **LM Studio (Local)**。

4. 向导会从 `http://localhost:1234/v1/models` 发现模型。选择一个。

5. 按提示输入模型上下文长度。

## 本地模型提示

- 运行 `fermi init` **之前**请确保服务器已启动。向导需要查询可用模型。
- 如果你在本地服务器中更换模型，请重新运行 `fermi init` 更新 Fermi 配置。
- 本地模型的上下文窗口通常小于云端模型。Fermi 的上下文管理（`summarize_context`、`/compact`）对保持会话效率尤其重要。
- 会话中可使用 `/model` 在本地和云端模型之间切换。
