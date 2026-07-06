/** @jsxImportSource @opentui/react */

import React from "react";
import { createTextAttributes } from "@opentui/core";
import { useRenderer } from "@opentui/react";

import type { PresentationPanelProps } from "../conversation-types.js";
import type { PresentationEntry } from "../../presentation/types.js";
import { PresentationEntryComponent } from "./presentation-entry.js";
import {
  MIN_VIRTUALIZE_COUNT,
  TranscriptHeightModel,
  buildPrefixTops,
  computeMountWindow,
  type MountWindow,
} from "./transcript-virtualization.js";

const ATTRS_BOLD = createTextAttributes({ bold: true });

/** Estimated rows covered by the first-paint window (bottom of the
 * transcript) before the frame callback measures the real viewport —
 * roughly two tall terminal screens; corrected within one frame. The first
 * render is the transcript's allocation peak (everything it mounts is
 * materialized before the window logic can correct it), so this must stay
 * close to one viewport, not a fixed entry count. */
const INITIAL_MOUNT_ROWS = 200;

/**
 * Brand wordmark. Horizontally centered within its container; the
 * caller controls vertical placement (welcome screen renders this in
 * an absolutely-positioned layer keyed to absolute terminal height, so
 * it never shifts when the conversation viewport resizes).
 */
export function LogoBlock(
  { lines, color }: { lines: readonly string[]; color: string },
): React.ReactNode {
  return (
    <box flexDirection="column" width="100%" alignItems="center" paddingBottom={1}>
      {lines.map((line, index) => (
        <text key={`logo-${index}`} fg={color} content={line} />
      ))}
    </box>
  );
}

function initialWindow(
  items: readonly PresentationEntry[],
  model: TranscriptHeightModel,
  contentWidth: number,
): MountWindow {
  const count = items.length;
  let start = count;
  let rows = 0;
  while (start > 0 && rows < INITIAL_MOUNT_ROWS) {
    start--;
    rows += model.heightFor(items[start]!, contentWidth);
  }
  return { start, end: count - 1, atTail: true };
}

/**
 * Pure entry list — renders logo, sub-session indicator, and conversation entries.
 * Does NOT own a scrollbox; the parent (OpenTuiScreen) wraps this in a ScrollViewport
 * and passes its `scrollRef` down so the list can virtualize against it.
 *
 * Long transcripts are windowed: only entries near the viewport mount real
 * components; everything else is folded into two invisible spacer boxes whose
 * heights come from TranscriptHeightModel (estimates until first measured).
 * This is what keeps a restored multi-MB session from materializing thousands
 * of renderables/native buffers up front — see transcript-virtualization.ts.
 */
function PresentationPanelInner(
  {
    items,
    colors,
    theme,
    contentWidth,
    markdownMode,
    diffDisplayMode,
    markdownStyle,
    selectedChildId,
    showLogoInScroll,
    branding,
    scrollRef,
    onEntryClick,
    onAgentClick,
  }: PresentationPanelProps,
): React.ReactNode {
  // Logo is no longer rendered here: the welcome wordmark lives in an
  // absolutely-positioned layer in OpenTuiScreen (keyed to terminal
  // height) so it stays put when the conversation viewport resizes.
  // `showLogoInScroll` / `branding` are kept on the prop type for the
  // caller's gating but are intentionally unused in this subtree.
  void showLogoInScroll;
  void branding;

  const renderer = useRenderer();
  const modelRef = React.useRef<TranscriptHeightModel>(null as unknown as TranscriptHeightModel);
  if (!modelRef.current) modelRef.current = new TranscriptHeightModel();
  const wrapperRefs = React.useRef(new Map<string, { height: number } | null>());
  const headerRef = React.useRef<{ height: number } | null>(null);

  const [window, setWindow] = React.useState<MountWindow>(
    () => initialWindow(items, modelRef.current, contentWidth),
  );
  const windowRef = React.useRef(window);
  windowRef.current = window;

  const virtualize = items.length > MIN_VIRTUALIZE_COUNT;

  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const widthRef = React.useRef(contentWidth);
  widthRef.current = contentWidth;

  const indexById = React.useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < items.length; i++) map.set(items[i]!.id, i);
    return map;
  }, [items]);
  const indexByIdRef = React.useRef(indexById);
  indexByIdRef.current = indexById;

  // Transcript source switched (parent <-> child session): entry ids can
  // collide across logs, so cached heights are meaningless. Start over.
  React.useEffect(() => {
    modelRef.current.clear();
    setWindow(initialWindow(itemsRef.current, modelRef.current, widthRef.current));
  }, [selectedChildId]);

  // Rendering context changed — every measured height is stale. Keep the
  // values as estimates (better than kind-heuristics) but re-measure on view.
  React.useEffect(() => {
    modelRef.current.demoteMeasurements();
  }, [contentWidth, markdownMode, diffDisplayMode, markdownStyle, theme, colors]);

  // Drop height records for entries that no longer exist (rewind, /clear).
  React.useEffect(() => {
    modelRef.current.prune(new Set(indexById.keys()));
  }, [indexById]);

  // Virtualization driver: each frame, measure mounted entries (anchoring the
  // scroll position when a parked estimate gets corrected above the viewport)
  // and re-window when the visible range moved.
  React.useEffect(() => {
    if (!virtualize) return;
    const cb = async (): Promise<void> => {
      const sb = scrollRef?.current;
      if (!sb) return;
      const model = modelRef.current;
      const currentItems = itemsRef.current;
      const width = widthRef.current;
      const topOffset = headerRef.current?.height ?? 0;
      const scrollTop: number = sb.scrollTop ?? 0;
      const viewportHeight: number = sb.viewport?.height ?? 40;
      const atBottom = scrollTop >= (sb.scrollHeight ?? 0) - viewportHeight - 1;

      // Measure mounted entries against the pre-measurement geometry.
      const tops = buildPrefixTops(currentItems, model, width, topOffset);
      let deltaAbove = 0;
      for (const [id, renderable] of wrapperRefs.current) {
        if (!renderable) continue;
        const idx = indexByIdRef.current.get(id);
        if (idx == null) continue;
        const rows = renderable.height;
        if (!(rows > 0)) continue;
        const delta = model.recordMeasurement(currentItems[idx]!, width, rows);
        if (delta !== 0 && tops[idx]! < scrollTop) deltaAbove += delta;
      }
      if (deltaAbove !== 0 && !atBottom) {
        sb.scrollTop = scrollTop + deltaAbove;
      }

      const next = computeMountWindow({
        tops: buildPrefixTops(currentItems, model, width, topOffset),
        scrollTop: sb.scrollTop ?? 0,
        viewportHeight,
        prev: windowRef.current,
      });
      const prev = windowRef.current;
      if (next.start !== prev.start || next.end !== prev.end || next.atTail !== prev.atTail) {
        setWindow(next);
      }
    };
    renderer.setFrameCallback(cb);
    return () => renderer.removeFrameCallback(cb);
  }, [renderer, scrollRef, virtualize]);

  const count = items.length;
  const start = virtualize ? Math.min(Math.max(0, window.start), Math.max(0, count - 1)) : 0;
  const end = virtualize
    ? (window.atTail ? count - 1 : Math.min(Math.max(window.end, start), count - 1))
    : count - 1;

  let topSpacerRows = 0;
  let bottomSpacerRows = 0;
  if (virtualize) {
    const model = modelRef.current;
    for (let i = 0; i < start; i++) topSpacerRows += model.heightFor(items[i]!, contentWidth);
    for (let i = end + 1; i < count; i++) bottomSpacerRows += model.heightFor(items[i]!, contentWidth);
  }

  const renderEntry = (entry: PresentationEntry): React.ReactNode => (
    <PresentationEntryComponent
      key={entry.id}
      entry={entry}
      colors={colors}
      theme={theme}
      contentWidth={contentWidth}
      markdownMode={markdownMode}
      diffDisplayMode={diffDisplayMode}
      markdownStyle={markdownStyle}
      onEntryClick={onEntryClick}
      onAgentClick={onAgentClick}
    />
  );

  return (
    <box flexDirection="column" gap={0}>
      {selectedChildId ? (
        <box
          ref={(r: { height: number } | null) => { headerRef.current = r; }}
          flexDirection="column"
          paddingLeft={2}
          paddingBottom={1}
        >
          <text fg={colors.accent} attributes={ATTRS_BOLD} content={`SUB-SESSION ${selectedChildId}`} />
          <text fg={colors.dim} content="Esc back to primary session · Ctrl+C interrupt child turn" />
        </box>
      ) : null}
      {virtualize ? (
        <>
          {topSpacerRows > 0 ? <box key="v-top" height={topSpacerRows} flexShrink={0} /> : null}
          {items.slice(start, end + 1).map((entry) => (
            <box
              key={entry.id}
              ref={(r: { height: number } | null) => {
                if (r) wrapperRefs.current.set(entry.id, r);
                else wrapperRefs.current.delete(entry.id);
              }}
              flexDirection="column"
              flexShrink={0}
            >
              {renderEntry(entry)}
            </box>
          ))}
          {bottomSpacerRows > 0 ? <box key="v-bottom" height={bottomSpacerRows} flexShrink={0} /> : null}
        </>
      ) : (
        items.map(renderEntry)
      )}
    </box>
  );
}

export const PresentationPanel = React.memo(
  PresentationPanelInner,
  (previous, next) => (
    previous.items === next.items
    && previous.processing === next.processing
    && previous.contentWidth === next.contentWidth
    && previous.markdownMode === next.markdownMode
    && previous.diffDisplayMode === next.diffDisplayMode
    && previous.colors === next.colors
    && previous.theme === next.theme
    && previous.markdownStyle === next.markdownStyle
    && previous.selectedChildId === next.selectedChildId
    && previous.showLogoInScroll === next.showLogoInScroll
    && previous.branding === next.branding
    && previous.scrollRef === next.scrollRef
  ),
);
