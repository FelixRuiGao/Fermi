---
name: profiling
description: Capture and interpret a real CPU, memory, or allocation profile (flamegraph, sampling profiler, heap snapshot) to locate where time/memory actually goes. Use when you need to measure, not guess, a performance problem.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; profiling methodology (no text reused)
---

# Profiling

`perf-audit` reasons about code; `benchmark` measures a unit; **profiling**
captures where a real run actually spends time/memory. Measure before you
optimize.

## 1. Pick the profiler and the right kind

- **CPU / wall**: Node `--prof`/`--cpu-prof` or `clinic`/`0x`; Python
  `py-spy`/`cProfile`+`snakeviz`/`scalene`; Go `pprof`; Rust `cargo flamegraph`/
  `perf`; JVM `async-profiler`. Linux `perf` + flamegraph for native.
- **Memory/alloc/leak**: heap snapshots (Chrome devtools / `heapdump`),
  `tracemalloc`/`memray`/`scalene`, `pprof -alloc_space`, valgrind/massif.
- Decide: is the symptom CPU-bound, I/O/wait-bound (a CPU profile will look idle
  — use wall-clock/async profiling), or memory growth? `$ARGUMENTS` describes
  the scenario.

## 2. Capture a representative run

Profile **production-like** input and load — a toy input profiles the wrong
thing. Warm up first (skip cold-start/JIT). Profile the realistic workload long
enough for the sampler to be statistically meaningful. Isolate: no competing
load, one scenario.

## 3. Read it correctly

- **Self time vs total/cumulative**: optimize functions with high *self* time;
  high cumulative just means "it calls expensive things".
- Flamegraph: width = time. Find the widest plateaus; ignore narrow spikes.
  Look for surprising frames (serialization, logging, GC, lock wait, a hot
  syscall, an O(n²) hidden in a library call).
- Memory: growth that never frees = leak; find retaining paths in the heap
  snapshot (what still references it). Distinguish high churn (GC pressure) from
  a true leak.
- Beware observer effect: heavy instrumentation distorts; sampling profilers
  are lower-overhead for hot paths.

## 4. Conclude and act

Report the actual top cost(s) with evidence (the flamegraph/profile numbers),
not a hunch. Hand off to `perf-audit` for the fix, then **re-profile** to prove
the hotspot moved/shrank. If the profile shows the suspected hotspot is
irrelevant at real scale, say so and stop — that's a valid, valuable result.
