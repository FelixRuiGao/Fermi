/** @jsxImportSource @opentui/react */

import React from "react";
import type { DisplayTheme } from "../theme/index.js";

export interface McpFailure {
  name: string;
  error?: string;
}

interface McpToastProps {
  failures: McpFailure[];
  theme: DisplayTheme;
  terminalWidth: number;
}

const TOAST_WIDTH = 44;

// The toast does not auto-dismiss: an MCP connection failure stays visible
// until it clears on its own (the server recovers — handled by onMcpStatus) or
// the user dismisses it manually (Ctrl+L). Both paths live at the app level.
export function McpToast({
  failures,
  theme,
  terminalWidth,
}: McpToastProps): React.ReactNode {
  const { colors } = theme;

  const lines: string[] = [];
  for (const f of failures.slice(0, 3)) {
    const err = f.error ? `: ${f.error.slice(0, 40)}` : "";
    lines.push(`  ✗ ${f.name}${err}`);
  }
  if (failures.length > 3) {
    lines.push(`  … and ${failures.length - 3} more`);
  }

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
        borderColor={colors.errorStatus ?? colors.dim}
        title=" MCP "
        titleColor={colors.errorStatus ?? colors.accent}
        fillTransparentBackground={true}
        paddingLeft={1}
        paddingRight={1}
        width="100%"
      >
        <text
          fg={colors.text}
          content={`${failures.length} server${failures.length > 1 ? "s" : ""} failed to connect:`}
        />
        {lines.map((line, i) => (
          <text key={i} fg={colors.dim} content={line} />
        ))}
      </box>
    </box>
  );
}
