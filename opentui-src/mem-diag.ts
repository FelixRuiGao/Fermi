/**
 * Env-gated memory diagnostics for the TUI process.
 *
 * Enable with `FERMI_MEM_DIAG=<path>` — every 10s (and on SIGUSR2) appends a
 * JSON line to `<path>` with process RSS, JSC heap stats, top heap object
 * counts, and the live renderable count. Zero cost when the env var is unset:
 * nothing is imported or scheduled.
 */
export function maybeStartMemDiag(): void {
  const outPath = process.env["FERMI_MEM_DIAG"];
  if (!outPath) return;

  const shrinkEachTick = process.env["FERMI_MEM_DIAG_SHRINK"] === "1";

  const dump = async () => {
    try {
      const jsc = await import("bun:jsc");
      if (shrinkEachTick) {
        Bun.gc(true);
        (jsc as { shrink?: () => void }).shrink?.();
      }
      const { heapStats } = jsc;
      const { appendFileSync } = await import("node:fs");
      const { Renderable } = await import("@opentui/core");
      const stats = heapStats();
      const counts = Object.entries(stats.objectTypeCounts as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      const mu = process.memoryUsage();
      let maxRenderableNum = 0;
      const tall: Array<{ id: string; w: number; h: number }> = [];
      for (const [num, r] of Renderable.renderablesByNumber) {
        if (num > maxRenderableNum) maxRenderableNum = num;
        const h = (r as { height?: number }).height ?? 0;
        if (h > 200) {
          tall.push({ id: String((r as { id?: unknown }).id ?? num), w: (r as { width?: number }).width ?? 0, h });
        }
      }
      tall.sort((a, b) => b.h - a.h);
      const line = JSON.stringify({
        ts: Date.now(),
        rssMB: +(mu.rss / 1048576).toFixed(1),
        maxRenderableNum,
        tallest: tall.slice(0, 5),
        heapUsedMB: +(mu.heapUsed / 1048576).toFixed(1),
        externalMB: +(mu.external / 1048576).toFixed(1),
        arrayBuffersMB: +(mu.arrayBuffers / 1048576).toFixed(1),
        jscHeapSizeMB: +(stats.heapSize / 1048576).toFixed(1),
        jscExtraMB: +(stats.extraMemorySize / 1048576).toFixed(1),
        objectCount: stats.objectCount,
        renderables: Renderable.renderablesByNumber.size,
        topObjects: Object.fromEntries(counts),
      });
      appendFileSync(outPath, line + "\n");
    } catch {
      /* diagnostics must never break the TUI */
    }
  };

  const intervalMs = Number(process.env["FERMI_MEM_DIAG_INTERVAL"]) || 10_000;
  setInterval(dump, intervalMs).unref?.();
  try {
    process.on("SIGUSR2", () => void dump());
  } catch {
    /* signal handlers unsupported — interval alone is fine */
  }
}
