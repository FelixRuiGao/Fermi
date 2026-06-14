/** @jsxImportSource @opentui/react */

import React from "react";
import { createTextAttributes } from "@opentui/core";
import type { DisplayTheme } from "../theme/index.js";

const ATTRS_BOLD = createTextAttributes({ bold: true });

export type UpdateToastPhase = "downloading" | "staged" | "available";

interface UpdateToastProps {
  phase: UpdateToastPhase;
  version: string;
  theme: DisplayTheme;
  terminalWidth: number;
  onRestart: () => void;
  onDismiss: () => void;
}

const TOAST_WIDTH = 42;

export function UpdateToast({
  phase,
  version,
  theme,
  terminalWidth,
  onRestart,
  onDismiss,
}: UpdateToastProps): React.ReactNode {
  const { colors } = theme;

  const isReady = phase === "staged";
  const bodyLine1 = isReady
    ? "A new version of Fermi downloaded."
    : "A new version of Fermi detected.";
  const bodyLine2 = isReady
    ? undefined
    : phase === "downloading"
      ? "Downloading update..."
      : `Run \`fermi update\` to install.`;

  return (
    <box
      position="absolute"
      top={2}
      left={Math.max(0, terminalWidth - TOAST_WIDTH - 3)}
      width={TOAST_WIDTH}
      zIndex={50}
      flexDirection="column"
    >
      <box
        border={true}
        borderStyle="rounded"
        borderColor={colors.dim}
        title=" New Fermi "
        titleColor={colors.accent}
        fillTransparentBackground={true}
        paddingLeft={1}
        paddingRight={1}
        width="100%"
      >
        <text fg={colors.text} content={bodyLine1} />
        {bodyLine2 ? <text fg={colors.text} content={bodyLine2} /> : null}
        {isReady ? (
          <box flexDirection="row">
            <text
              fg={colors.accent}
              attributes={ATTRS_BOLD}
              content="Restart"
              onMouseDown={(e: any) => {
                e.stopPropagation();
                e.preventDefault();
                onRestart();
              }}
            />
            <text fg={colors.text} content=" to apply." />
          </box>
        ) : null}
      </box>
      {/* Bottom border overlay: fill clears border chars, then text renders on top */}
      <box position="absolute" bottom={0} right={1} flexDirection="row" fillTransparentBackground={true}>
        <text fg={colors.text} content=" Ctrl+L " />
        <text
          fg={colors.accent}
          content="dismiss "
          onMouseDown={(e: any) => {
            e.stopPropagation();
            e.preventDefault();
            onDismiss();
          }}
        />
      </box>
    </box>
  );
}
