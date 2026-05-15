import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("patched markdown renderer does not treat synthetic thematic break as front matter", async () => {
  await import("./patch-opentui-markdown.js")

  const {
    CodeRenderable,
    MarkdownRenderable,
    RGBA,
    SyntaxStyle,
    TreeSitterClient,
  } = await import("@opentui/core")
  const { createTestRenderer } = await import("./core/testing/test-renderer.js")

  const dataPath = join(tmpdir(), "tree-sitter-patched-markdown-renderable-test-data")
  await mkdir(dataPath, { recursive: true })

  const treeSitterClient = new TreeSitterClient({ dataPath })
  await treeSitterClient.initialize()

  const testRenderer = await createTestRenderer({ width: 80, height: 30 })
  const { renderer, renderOnce, captureCharFrame } = testRenderer

  try {
    const syntaxStyle = SyntaxStyle.fromStyles({
      default: { fg: RGBA.fromValues(1, 1, 1, 1) },
    })

    const markdown = `| Name |
|---|
| Alice |
---
### UI 双轨
- **OpenTUI**（\`opentui-src/\`）—— 终端界面
---
### 技术栈
TypeScript`

    const md = new MarkdownRenderable(renderer, {
      id: "patched-markdown",
      content: markdown,
      syntaxStyle,
      treeSitterClient,
      conceal: true,
      tableOptions: { widthMode: "content" },
    })

    renderer.root.add(md)

    const hasPendingMarkdownHighlights = (): boolean =>
      md
        .getChildren()
        .some((child: unknown) =>
          child instanceof CodeRenderable &&
          child.filetype === "markdown" &&
          child.isHighlighting
        )

    await renderOnce()
    const startedAt = Date.now()
    while (hasPendingMarkdownHighlights() && Date.now() - startedAt < 2000) {
      await Bun.sleep(10)
      await renderOnce()
    }
    await renderOnce()

    const rendered = captureCharFrame()

    expect(rendered).toContain("UI 双轨")
    expect(rendered).toContain("- OpenTUI（opentui-src/）—— 终端界面")
    expect(rendered).toContain("技术栈")
    expect(rendered).not.toContain("### UI 双轨")
    expect(rendered).not.toContain("**OpenTUI**")
    expect(rendered).not.toContain("`opentui-src/`")
    expect(rendered).not.toContain("### 技术栈")
  } finally {
    renderer.destroy()
    await treeSitterClient.destroy()
  }
})
