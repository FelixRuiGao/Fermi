import React from "react";

/**
 * Linear icon set (stroke 1.5, 16px viewBox). All chrome icons in the
 * webview come from here — no emoji in UI chrome. Message *content* may
 * still contain emoji; that's the model's business, not the chrome's.
 */

type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

function icon(path: React.ReactNode, viewBox = "0 0 16 16") {
  return function Icon({ size = 16, className, style }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const IconPlus = icon(<path d="M8 3.5v9M3.5 8h9" />);
export const IconSlash = icon(<path d="M10.5 3L5.5 13" />);
export const IconChevronDown = icon(<path d="M4 6.5L8 10.5L12 6.5" />);
export const IconChevronRight = icon(<path d="M6 4L10 8L6 12" />);
export const IconArrowUp = icon(<path d="M8 12.5V3.5M4.5 7L8 3.5L11.5 7" />);
export const IconArrowDown = icon(<path d="M8 3.5v9M4.5 9L8 12.5L11.5 9" />);
export const IconStop = icon(<rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" stroke="none" />);
export const IconHistory = icon(
  <>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
    <path d="M2.5 2.5v2.6h2.6" />
    <path d="M8 5.2V8l2 1.6" />
  </>,
);
export const IconCopy = icon(
  <>
    <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" />
    <path d="M3 10.5V4a1.5 1.5 0 0 1 1.5-1.5h6.5" />
  </>,
);
export const IconCheck = icon(<path d="M3 8.5L6.5 12L13 4.5" />);
export const IconX = icon(<path d="M4 4l8 8M12 4l-8 8" />);
export const IconFile = icon(
  <>
    <path d="M9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V5.5L9.5 2z" />
    <path d="M9.5 2v3.5H13" />
  </>,
);
export const IconTerminal = icon(
  <>
    <path d="M4 5.5L7 8l-3 2.5" />
    <path d="M8.5 11H12" />
  </>,
);
export const IconSearch = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L13.5 13.5" />
  </>,
);
export const IconGlobe = icon(
  <>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M2.5 8h11M8 2.5c1.8 1.6 2.6 3.5 2.6 5.5S9.8 11.9 8 13.5C6.2 11.9 5.4 10 5.4 8S6.2 4.1 8 2.5z" />
  </>,
);
export const IconEdit = icon(
  <path d="M11.1 2.6a1.6 1.6 0 0 1 2.3 2.3L6 12.3l-3 .7.7-3 7.4-7.4z" />,
);
export const IconFolder = icon(
  <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.8h4.9A1.5 1.5 0 0 1 14 6.3v5.2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z" />,
);
export const IconBranch = icon(
  <>
    <circle cx="4.5" cy="4" r="1.6" />
    <circle cx="4.5" cy="12" r="1.6" />
    <circle cx="11.5" cy="6" r="1.6" />
    <path d="M4.5 5.6v4.8M11.5 7.6c0 2.2-2.5 2.6-4.5 2.8" />
  </>,
);
export const IconAgent = icon(
  <>
    <path d="M3 4.5h6M3 8h4" />
    <path d="M9.5 8.5L13 12M13 8.5L9.5 12" />
  </>,
);
export const IconSparkle = icon(
  <path d="M8 2.5l1.3 3.6L13 7.4l-3.7 1.3L8 12.3 6.7 8.7 3 7.4l3.7-1.3L8 2.5z" />,
);
export const IconWarning = icon(
  <>
    <path d="M8 2.8L14.4 13.2H1.6L8 2.8z" />
    <path d="M8 6.8v2.8M8 11.6v.1" />
  </>,
);
export const IconGear = icon(
  <>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3" />
  </>,
);
export const IconHand = icon(
  <path d="M5 8.2V3.9a.9.9 0 0 1 1.8 0v3.2V2.9a.9.9 0 0 1 1.8 0v4.2V3.9a.9.9 0 0 1 1.8 0v4.4l1.5-1.4a1 1 0 0 1 1.4 1.4l-3 3.9a3.4 3.4 0 0 1-2.7 1.3H7.2A3.2 3.2 0 0 1 4 10.3L3.2 8.9a.9.9 0 0 1 1.5-.9l.3.2z" />,
);
export const IconZap = icon(<path d="M8.8 2L3.5 9h3.4L7.2 14l5.3-7H9.1L8.8 2z" />);
export const IconEye = icon(
  <>
    <path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z" />
    <circle cx="8" cy="8" r="1.8" />
  </>,
);
export const IconList = icon(
  <path d="M5.5 4.5H13M5.5 8H13M5.5 11.5H13M3 4.5h.01M3 8h.01M3 11.5h.01" />,
);
export const IconCircle = icon(<circle cx="8" cy="8" r="5" />);
export const IconCircleDot = icon(
  <>
    <circle cx="8" cy="8" r="5" />
    <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
  </>,
);
export const IconDiff = icon(
  <>
    <path d="M5 2.5v6M2 5.5h6" />
    <path d="M2.5 12h11" strokeWidth="1.5" />
    <path d="M9.5 3.5H14" />
  </>,
);

/** Tool name → icon component. */
export function toolIcon(toolName: string): React.ComponentType<IconProps> {
  switch (toolName) {
    case "bash":
    case "shell":
      return IconTerminal;
    case "read_file":
    case "list_directory":
      return IconFile;
    case "write_file":
    case "edit_file":
      return IconEdit;
    case "search_files":
    case "grep":
    case "glob":
      return IconSearch;
    case "web_search":
    case "web_fetch":
      return IconGlobe;
    case "spawn":
    case "agent":
      return IconAgent;
    case "ask_user":
      return IconHand;
    default:
      return IconGear;
  }
}
