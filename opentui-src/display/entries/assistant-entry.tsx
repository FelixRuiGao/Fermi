/** @jsxImportSource @opentui/react */

import React from "react";

import { getFermiAssistantRenderer } from "../../forked/core/lib/diagnostic.js";
import type { PresentationEntry } from "../../presentation/types.js";
import type { ConversationPalette } from "../../components/conversation-types.js";
const ASSISTANT_RENDERER_MODE = getFermiAssistantRenderer();

interface AssistantEntryProps {
  entry: PresentationEntry;
  colors: ConversationPalette;
  markdownMode: "rendered" | "raw";
  markdownStyle: any;
}

export function AssistantEntry({
  entry,
  colors,
  markdownMode,
  markdownStyle,
}: AssistantEntryProps): React.ReactNode {
  const text = entry.assistantText ?? "";

  // Assistant markdown/code is pinned to streaming mode permanently — it is
  // intentionally NOT flipped to false when the turn ends. `entry.assistantStreaming`
  // is read and discarded on purpose (kept on the entry for other consumers / debug).
  //
  // Why this exists — the per-turn flicker it fixes:
  //   When the last assistant entry transitioned streaming=true -> false at turn
  //   end, OpenTUI's MarkdownRenderable.streaming setter ran updateBlocks(true),
  //   which (a) re-finalized the trailing blocks (trailingUnstable 2 -> 0) and
  //   (b) reset our Fermi streaming height floor (reserveHeightWhileStreaming),
  //   letting the block snap from its streamed height down to its compact height.
  //   That snap is a non-monotonic content-size change, and the conversation
  //   ScrollBox is sticky-bottom: a size change re-pins the scroll offset and
  //   schedules an unconditional nextTick repaint (ScrollBox.recalculateBarProps).
  //   The net result was a full-viewport redraw — a visible flicker — at the end
  //   of EVERY turn. Pinning streaming=true removes the transition, so the
  //   finalize/snap (and therefore the flicker) never happens.
  //
  // Precedent: opencode (a large production TUI on the same @opentui stack) keeps
  // its assistant markdown at streaming={true} and never finalizes it. So this is
  // a known-viable approach, not a novel hack.
  //
  // Tested without finding a bug on the default markdown renderer: /resume cold
  // mount, raw<->rendered toggle, and completed messages ending in tables, fenced
  // code blocks, blockquotes/lists, and interrupted / half-formed markdown. It is
  // safe on the default path because that path never depends on an async highlight's
  // first frame: fenced code blocks render through a synchronous hljs-styled
  // TextRenderable wrapper (patch-opentui-markdown.ts createCodeRenderable), and
  // prose blocks receive a synchronous initialStyledText (which is only produced
  // while streaming=true), so there is no blank-until-highlight on cold mount.
  // (The one path that WOULD blank — a whole-message <code> with
  // drawUnstyledText=false — only occurs under the internal, non-user
  // FERMI_OPENTUI_ASSISTANT_RENDERER=code flag.)
  //
  // Known, accepted cost: because streaming never ends, the Fermi streaming height
  // floor never resets, so a completed message keeps its streamed height instead of
  // snapping compact — at worst a line or two of residual trailing space on messages
  // whose streamed height exceeded the final concealed height. Accepted: far cheaper
  // than a guaranteed full repaint on every turn.
  //
  // Do NOT revert this to `entry.assistantStreaming` without replacing the mechanism
  // — that brings the per-turn flicker straight back. The clean (larger) alternative
  // is to keep only the actively-streaming entry in streaming mode and converge the
  // height in a single frame at finalize; that is deliberately not done here.
  void entry.assistantStreaming;
  const renderedStreaming = true;

  return (
    <box paddingTop={1}>
      {markdownMode === "raw" ? (
        <text fg={colors.text} content={text} />
      ) : ASSISTANT_RENDERER_MODE === "code" ? (
        <code
          content={text}
          filetype="markdown"
          syntaxStyle={markdownStyle}
          streaming={renderedStreaming}
          conceal={true}
          drawUnstyledText={false}
          fg={colors.text}
          width="100%"
        />
      ) : (
        <markdown
          content={text}
          syntaxStyle={markdownStyle}
          treeSitterClient={undefined}
          streaming={renderedStreaming}
          conceal={true}
          concealCode={false}
          internalBlockMode="top-level"
          width="100%"
          tableOptions={{
            widthMode: "content",
            borders: true,
            outerBorder: true,
            borderStyle: "single",
            borderColor: colors.text,
            wrapMode: "word",
            cellPaddingX: 1,
            selectable: true,
          }}
        />
      )}
    </box>
  );
}
