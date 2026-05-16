/** @jsxImportSource @opentui/react */

import React from "react";
import { createTextAttributes } from "@opentui/core";

const ATTRS_BOLD = createTextAttributes({ bold: true });

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

function noise2D(x: number, y: number): number {
  return (
    Math.sin(x * 1.2 + y * 0.7)
    + Math.sin(x * 0.7 + y * 1.3)
    + Math.sin((x + y) * 0.8)
  ) / 3;
}

interface GlowTextProps {
  text: string;
  fromColor: string;
  toColor: string;
}

function GlowTextInner({
  text,
  fromColor,
  toColor,
}: GlowTextProps): React.ReactNode {
  const [time, setTime] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTime((t) => t + 0.1), 33);
    return () => clearInterval(id);
  }, []);

  // ~4s period, compound sine for organic feel (avoids mechanical repetition).
  // Sweeps fromColor(pale blue) → midrange(accent) → toColor(deep blue-purple).
  const t = (Math.sin(time * 0.5) * 0.7 + Math.sin(time * 0.37) * 0.3 + 1) * 0.5;
  const fg = lerpColor(fromColor, toColor, t);

  return <text fg={fg} attributes={ATTRS_BOLD} content={text} />;
}

export const GlowText = React.memo(GlowTextInner);
