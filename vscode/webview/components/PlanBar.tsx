import React, { useState } from "react";
import { useStore } from "../store.js";
import { IconChevronRight, IconList, IconCheck, IconCircle, IconCircleDot } from "./icons.js";

/**
 * Collapsible checklist pinned above the transcript, driven by the
 * server's plan.changed events (the model's plan.md checkboxes).
 */
export function PlanBar() {
  const plan = useStore((s) => s.plan);
  const [expanded, setExpanded] = useState(false);

  if (plan.length === 0) return null;

  const done = plan.filter((p) => p.status === "done").length;
  const active = plan.find((p) => p.status === "active");

  return (
    <div className="plan-bar">
      <div className="plan-bar-header" onClick={() => setExpanded(!expanded)}>
        <IconChevronRight
          size={10}
          style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 120ms ease-out" }}
        />
        <IconList size={12} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {expanded ? "Plan" : active ? active.text : "Plan"}
        </span>
        <span className="plan-bar-count">
          {done}/{plan.length}
        </span>
      </div>
      {expanded && (
        <div className="plan-bar-body">
          {plan.map((item, i) => (
            <div
              key={i}
              className={
                item.status === "done"
                  ? "plan-item plan-item-done"
                  : item.status === "active"
                    ? "plan-item plan-item-active"
                    : "plan-item plan-item-pending"
              }
            >
              <span className="plan-mark">
                {item.status === "done" ? (
                  <IconCheck size={11} style={{ color: "var(--f-ok)" }} />
                ) : item.status === "active" ? (
                  <IconCircleDot size={11} style={{ color: "var(--f-accent)" }} />
                ) : (
                  <IconCircle size={11} style={{ color: "var(--f-faint)" }} />
                )}
              </span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
