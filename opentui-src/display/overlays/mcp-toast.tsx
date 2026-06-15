/** @jsxImportSource @opentui/react */

import React, { useEffect, useRef } from "react";
import type { DisplayTheme } from "../theme/index.js";

export interface McpFailure {
  name: string;
  error?: string;
}

interface McpToastProps {
  failures: McpFailure[];
  theme: DisplayTheme;
  terminalWidth: number;
  onDismiss: () => void;
}

const TOAST_WIDTH = 44;
const AUTO_DISMISS_MS = 8000;

export function McpToast({
  failures,
  theme,
  terminalWidth,
  onDismiss,
}: McpToastProps): React.ReactNode {
  const { colors } = theme;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

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
