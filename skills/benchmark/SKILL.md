---
name: benchmark
description: Write a correct, statistically meaningful microbenchmark and interpret it without fooling yourself. Use when measuring performance, comparing implementations, or validating an optimization.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; benchmarking methodology (no text reused)
---

# Benchmark

Most hand-rolled benchmarks lie. Use a real harness and measure the right thing.

## 1. Use a proper harness

Reach for the ecosystem's benchmarking tool, not `Date.now()` around a loop:
`hyperfine` (CLI/whole-program), `tinybench`/`benchmark.js` or
`vitest bench` (JS), `pytest-benchmark`/`timeit` (Python), `go test -bench`
+ `benchstat`, `criterion` (Rust), JMH (Java). They handle warmup, iteration
count, and statistics correctly. `$ARGUMENTS` describes what to measure.

## 2. Avoid the classic traps

- **Warmup**: discard initial iterations (JIT, caches, lazy init) — measure
  steady state.
- **Dead-code elimination**: the compiler/JIT will delete work whose result is
  unused — consume the result (return it, blackbox it) so the work actually
  happens.
- **Realistic inputs & size**: benchmark the input distribution and scale that
  matters in production, not a tiny constant that fits in L1.
- **Isolate the variable**: change one thing between A and B; same machine,
  same data, no other load; pin frequency/turbo if you can.
- **Enough samples**: report a distribution (median + spread), not one run; run
  enough iterations that timer resolution and noise don't dominate.
- **Measure the real thing**: include/exclude I/O, allocation, setup
  deliberately and say which.

## 3. Interpret honestly

- A difference inside the noise band is **not** a difference — don't claim a
  speedup the variance doesn't support.
- Report median and variability, the input size it holds for, and the
  environment. Relate it to whole-program impact (a 2× speedup on 1% of runtime
  is ~nothing — see `perf-audit`).
- Re-run to confirm reproducibility before concluding.

Deliver the benchmark code, the numbers with spread, the conditions, and a
sober conclusion (including "no measurable difference" when that's the truth).
