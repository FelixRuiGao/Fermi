# Fermi for VS Code

<a href="./README.md">English</a> | 中文

[Fermi](https://github.com/FelixRuiGao/Fermi) 的侧边栏对话面板 —— 一个为长时间会话设计的 AI 编程 Agent。和终端版同一个后端，直接在你的编辑器里用。

## 功能

- **流式对话**，markdown 渲染 + 可折叠的工具调用卡片
- **内联 diff** —— 在 VS Code 的 diff 编辑器里审阅文件改动
- **权限控制** —— 审批 / 只读 / 完全访问，按会话切换
- **模型选择、slash 命令、从编辑器引用 `@文件`**
- **与终端共享会话** —— 在 Fermi TUI 里开始的对话会出现在扩展的历史中，反之亦然。点击即可在 tab 中打开。
- **Remote SSH** —— 运行在远程主机上；文件、凭证、会话都留在远程
- **一键安装** —— 找不到 `fermi` 二进制时，无需离开编辑器即可安装

## 前置要求

扩展驱动 `fermi` 二进制。如果未安装，欢迎页会提供一键安装（把最新 release 下载到 `~/.fermi/bin`）。在 Remote SSH 下会安装到远程主机。

## 快速开始

1. 从活动栏打开 Fermi 面板。
2. 如有提示，点击 **Install Fermi**，然后完成首次配置（provider + 模型）。
3. 提问或描述任务。`Enter` 发送，`Shift+Enter` 换行。

## 许可证

[MIT](./LICENSE)
