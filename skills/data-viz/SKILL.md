---
name: data-viz
description: Produce a clear chart or plot from a dataset (CSV/JSON/dataframe) — pick the right chart type, label it honestly, and save an image. Use when the user wants to visualize, plot, or chart data.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; uses matplotlib (PSF/BSD-style) / optional pandas (BSD-3), user-installed
---

# Data Visualization

The goal is an honest, readable picture of the data — not chartjunk.

## Requirements (preflight)

```bash
python3 -c "import matplotlib" 2>/dev/null || python3 -m pip install matplotlib
python3 -c "import pandas"     2>/dev/null || python3 -m pip install pandas   # if input is tabular
```

Not bundled — install on demand, respect an active venv, use a non-interactive
backend (`matplotlib.use("Agg")`) and save to a file (no GUI in an agent
context). If install isn't possible, say so.

## 1. Understand the data and the question

Load it, check shape/types/missing values (see `csv-data` for profiling). What
comparison does the user actually want — trend, distribution, composition,
relationship, ranking? The question dictates the chart.

## 2. Choose the right chart

- **Trend over time** → line.
- **Compare categories** → bar (horizontal if many/long labels); sorted unless
  order is meaningful.
- **Distribution** → histogram / box / violin.
- **Relationship** → scatter (add a trend line only if it's justified).
- **Composition** → stacked bar; avoid pie beyond ~3 slices.
- Don't use a dual y-axis or 3D unless truly necessary — they mislead.

## 3. Make it honest and readable

- Title states the takeaway; axes labeled **with units**; legend only if needed.
- Start bar-chart y-axis at zero (truncating exaggerates differences); don't
  cherry-pick ranges.
- Readable font sizes, non-overlapping ticks, colorblind-safe palette, enough
  DPI when saving.
- Don't plot misleading aggregates (mean hiding a bimodal distribution) — note
  it if the data warrants a different view.

## 4. Deliver

Save the image, state the file path, the chart type chosen and why, and any
data caveat (missing values excluded, outliers clipped — and how many). Never
fabricate or "smooth" data to make a nicer chart.
