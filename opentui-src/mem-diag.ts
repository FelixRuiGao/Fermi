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

  const dump = async () => {
    try {
      const { heapStats } = await import("bun:jsc");
      const { appendFileSync } = await import("node:fs");
      const { Renderable } = await import("@opentui/core");
      const stats = heapStats();
      const counts = Object.entries(stats.objectTypeCounts as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      const mu = process.memoryUsage();
      const line = JSON.stringify({
        ts: Date.now(),
        rssMB: +(mu.rss / 1048576).toFixed(1),
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

  setInterval(dump, 10_000).unref?.();
  try {
    process.on("SIGUSR2", () => void dump());
  } catch {
    /* signal handlers unsupported — interval alone is fine */
  }
}
