---
name: perf-audit
description: Find performance hotspots and inefficiencies in code — algorithmic, I/O, allocation, and query problems — and propose targeted fixes. Use when code is slow or asked to optimize performance.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard performance-analysis practice (no text reused)
---

# Performance Audit

Find what actually costs time, fix that, and prove it. Don't micro-optimize on
a hunch.

## 1. Frame the problem

What is slow, by how much, and against what target? `$ARGUMENTS` may name the
slow path. Get a number first — a benchmark, a timed run, a profiler, a slow
query log. Optimizing without a measurement is guessing.

## 2. Look for the high-leverage issues (usually here)

- **Algorithmic complexity**: nested loops over the same data (O(n²)),
  repeated linear scans, sorting in a loop, recomputation that could be cached.
- **N+1 / chatty I/O**: a query or network call *inside* a loop; missing
  batch/join; per-item round trips.
- **Unnecessary work**: computing values that are never used, eager work that
  could be lazy, recomputing invariants, over-broad data fetched then discarded.
- **Data structures**: list membership tests that should be a set/map; wrong
  container for the access pattern; repeated string concatenation.
- **Allocation/GC**: per-iteration allocations, copying large structures,
  unbounded caches/leaks.
- **Concurrency**: serial work that is independent and parallelizable; lock
  contention; blocking the event loop / async starvation.
- **Database**: missing index for a hot query, `SELECT *`, full scans,
  unbounded result sets, missing pagination.

## 3. Fix with the most impact first

Address the dominant cost before the rest (Amdahl's law — a 10× speedup on 5%
of runtime is nothing). Prefer a better algorithm or removing the work over
clever low-level tricks. Don't sacrifice correctness or readability for a gain
that doesn't matter at the real input size.

## 4. Prove it

Re-measure with the same benchmark and report before → after, the input size it
holds for, and the tradeoffs. Confirm behavior/tests are unchanged. If a
suspected hotspot turns out not to matter at realistic scale, say so and stop.
