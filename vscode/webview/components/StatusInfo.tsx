import React from "react";
import { useStore } from "../store.js";

export function StatusInfo() {
  const meta = useStore((s) => s.meta);
  const status = useStore((s) => s.status);

  if (!meta) return null;

  const model = meta.modelConfigName;
  const shortModel = model?.includes(":") ? model.split(":")[1] : model;
  const tokens = status?.lastInputTokens ?? 0;
  const budget = status?.contextBudget ?? 0;
  const pct = budget > 0 ? Math.round((tokens / budget) * 100) : 0;

  return (
    <div className="status-bar-bottom">
      <span>{shortModel}</span>
      {tokens > 0 && (
        <span>
          {(tokens / 1000).toFixed(1)}k tokens ({pct}%)
        </span>
      )}
    </div>
  );
}
