/** @jsxImportSource @opentui/react */

import React from "react";
import { createTextAttributes } from "@opentui/core";
import type { DisplayTheme } from "../theme/index.js";
import { ToastFrame } from "./toast-frame.js";

const ATTRS_BOLD = createTextAttributes({ bold: true });

export type UpdateToastPhase = "downloading" | "staged" | "available";

interface UpdateToastProps {
  phase: UpdateToastPhase;
  version: string;
  theme: DisplayTheme;
  onRestart: () => void;
  onDismiss: () => void;
}

export function UpdateToast({
  phase,
  version,
  theme,
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
    <ToastFrame
      title=" New Fermi "
      titleColor={colors.accent}
      borderColor={colors.dim}
      theme={theme}
      footer={[
        { text: " Ctrl+L " },
        { text: "dismiss ", color: colors.accent, onClick: onDismiss },
      ]}
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
    </ToastFrame>
  );
}
