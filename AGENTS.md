## Communication Rules

- When I ask for exact/raw output, provide the complete verbatim result — never summarize, paraphrase, or approximate unless explicitly told to.
- Never fabricate reasoning, rationale, or motivations I didn't express. If you're unsure why I made a decision, ask — don't invent explanations.

## Workflow Rules

- Before making changes, confirm you understand the full scope of the request. When implementing features across providers/models, list ALL affected items and get confirmation before proceeding. Do not assume a subset is sufficient.
- After completing implementation tasks, always update the relevant project documentation in Docs/ to reflect changes. This includes MAP.md and all affected module docs.
- Docs/ 中的文件永不 commit（已加入 .gitignore）。

## Release & Changelog

- Release notes 来源是仓库根的 `CHANGELOG.md`；workflow 用 awk 抽出与 tag 完全同名的段落（如 `## v0.3.2-alpha.3`）作为 GitHub Release 正文。不再走 `gh release --generate-notes`。
- 写入时机：commit 落地时顺手把面向用户的变化加到 `## Unreleased` 段落。内部重构/纯测试改动可省略。
- 发版步骤：
  1. 把 `## Unreleased` 标题改成对应 tag（例如 `## v0.3.2` 或 `## v0.3.2-alpha.3`）。
  2. 在顶上新加一个空的 `## Unreleased`。
  3. `package.json` 的 `version` 同步到该 tag。
  4. commit → `git tag vX.Y.Z[-pre.N]` → `git push && git push --tags`。
- 标题必须**完全匹配** tag 字面值（含 `v` 前缀和 prerelease 后缀）。CHANGELOG.md 缺段或段落为空 → CI 报错 → release 不会发出。

## Debugging

- When debugging dependency or API issues, check actual version constraints and API documentation rather than guessing versions. For model migrations, investigate ALL potential breaking changes (tool compatibility, schema validation, parameter support) before declaring a fix.
- 运行 CLI 命令验证时，如果输出为空，先检查 exit code（`echo $?`）判断成功/失败，不要盲目重试同一条命令。典型例子：`tsc --noEmit` 成功时没有任何输出，空输出就是「无错误」。

## Environment

- 若要使用 Python 命令，先使用 source .venv/bin/activate 激活 uv 环境。
- @LongerAgent-gui-wt/Docs/MAP.md 中是导航地图，其余组件文件在 Docs 的其他文档中。
- 对你没把握的内容，使用尽可能多的 web search 查找准确的结果而不是靠猜测和推断完成任务。
- 对于 GUI 部分，修改后使用 Electron Skill 启动应用并进行截图+可视化验证，检查渲染结果、布局、交互是否正常。（截图自动压缩已由 ~/.claude/hooks/resize-screenshots.sh 处理）

## Build & Install

- 本地构建并安装 fermi binary 的正确命令：
  ```bash
  bun run build && tar -xzf build/fermi-darwin-arm64.tar.gz -C ~/.fermi/bin/
  ```
- 安装目录是 `~/.fermi/bin/`，**不是** `~/.bun/bin/`。

## Additional

**GUI dev + 截图正确方法（2026-05 实测）：**

1. 启动 dev server（electron-vite 会同时拉 vite@5174 和 Electron 主进程）：

   ```bash
   cd /Users/felix/Documents/Agent/fermi/gui && \
     ELECTRON_ARGS="--remote-debugging-port=9222" pnpm dev > /tmp/fermi-dev.log 2>&1 &
   sleep 10
   ```

   `ELECTRON_ARGS` 会被 electron-vite v3 透传给 Electron 命令行，CDP 9222 直接起来，`pnpm dev` 是可用的（旧 CLAUDE.local.md 说不行已过时）。

2. 截图固定走 tab 0（Fermi 当前主页面就在 tab 0，不是 tab 1）；agent-browser 的 tab 上下文不跨命令保持，每次都要重新 `tab 0 && ...`：

   ```bash
   agent-browser --cdp 9222 tab 0 && agent-browser --cdp 9222 screenshot /tmp/shot.png
   ```

3. 不要尝试 `npx electron dist-main/main.js` —— 这条路径在当前布局下不存在（构建产物在 `gui/out/main/`），且 prod 模式下 `file://` 协议会让 `<script type="module">` 静默失败，截图全黑。dev 模式才是唯一可靠路径。
