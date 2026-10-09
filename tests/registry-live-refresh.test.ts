import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it("refreshes signed catalogs live across the runtime without restarting or disturbing an in-flight request", () => {
  // Catalog collections are process-wide. Isolate the integration fixture so
  // its deliberate catalog replacements cannot leak into other test files.
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./fixtures/registry-live-refresh.ts", import.meta.url))], { encoding: "utf8", timeout: 15000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain("disposal passed");
});
