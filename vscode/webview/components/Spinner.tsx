import React from "react";

export function Spinner({ text }: { text?: string }) {
  return (
    <div className="spinner">
      <div className="spinner-dot" />
      {text && <span>{text}</span>}
    </div>
  );
}
