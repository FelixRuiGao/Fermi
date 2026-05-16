import { afterEach, beforeEach, expect, test } from "bun:test"
import { createTestRenderer, type TestRenderer } from "../testing.js"
import { ScrollBarRenderable } from "./ScrollBar.js"

let renderer: TestRenderer

beforeEach(async () => {
  ;({ renderer } = await createTestRenderer({ width: 80, height: 24 }))
})

afterEach(() => {
  renderer.destroy()
})

test("ScrollBarRenderable keeps slider viewport size in sync when content grows after empty layout", () => {
  const bar = new ScrollBarRenderable(renderer, {
    orientation: "vertical",
    height: 20,
  })

  bar.viewportSize = 20
  bar.scrollSize = 100

  expect(bar.viewportSize).toBe(20)
  expect(bar.scrollSize).toBe(100)
  expect(bar.slider.max).toBe(80)
  expect(bar.slider.viewPortSize).toBe(20)
})
