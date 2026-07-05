import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCommands,
  filterCommands,
  COMMAND_GROUPS,
  type PanelView,
  type PickerSpec,
  type SlashCommand,
} from "../commands.js";
import { IconCheck, IconChevronRight } from "./icons.js";

export interface CommandPanelController {
  /** Run a command by exact name (e.g. "/model"). Returns false if unknown. */
  runByName(name: string): boolean;
}

interface Props {
  filter: string;
  onClose(): void;
  /** A command entered a multi-step flow — composer should clear its input. */
  onFlowStarted(): void;
  controllerRef?: React.MutableRefObject<CommandPanelController | null>;
}

type ViewState =
  | { kind: "commands" }
  | { kind: "loading" }
  | { kind: "picker"; spec: PickerSpec }
  | { kind: "input"; spec: import("../commands.js").InputSpec };

export function CommandPanel({ filter, onClose, onFlowStarted, controllerRef }: Props) {
  const [stack, setStack] = useState<ViewState[]>([{ kind: "commands" }]);
  const [selected, setSelected] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const view = stack[stack.length - 1];

  const commands = useMemo(() => buildCommands(), []);
  const filtered = useMemo(() => filterCommands(commands, filter), [commands, filter]);

  // Flat selectable rows for the commands view, with group headers interleaved.
  const commandRows = useMemo(() => {
    const rows: Array<{ header?: string; cmd?: SlashCommand }> = [];
    for (const group of COMMAND_GROUPS) {
      const inGroup = filtered.filter((c) => c.group === group);
      if (inGroup.length === 0) continue;
      rows.push({ header: group });
      for (const cmd of inGroup) rows.push({ cmd });
    }
    return rows;
  }, [filtered]);

  const selectableIndices = useMemo(() => {
    if (view.kind === "commands") {
      return commandRows.map((r, i) => (r.cmd ? i : -1)).filter((i) => i >= 0);
    }
    if (view.kind === "picker") {
      return view.spec.items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    }
    return [];
  }, [view, commandRows]);

  useEffect(() => {
    setSelected(selectableIndices[0] ?? 0);
  }, [selectableIndices]);

  useEffect(() => {
    if (view.kind === "picker" && view.spec.checkbox) {
      setChecked(new Set(view.spec.items.filter((i) => i.checked).map((i) => i.value)));
    }
    if (view.kind === "input") {
      setInputText(view.spec.initial ?? "");
    }
  }, [view]);

  const pushView = useCallback((v: PanelView) => {
    setStack((prev) => [...prev, v as ViewState]);
  }, []);

  const handleFlowResult = useCallback(
    async (result: void | PanelView | Promise<void | PanelView>, replaceLoading: boolean) => {
      try {
        const resolved = await result;
        if (resolved) {
          setStack((prev) => {
            const base = replaceLoading && prev[prev.length - 1]?.kind === "loading" ? prev.slice(0, -1) : prev;
            return [...base, resolved as ViewState];
          });
          onFlowStarted();
        } else {
          onClose();
        }
      } catch {
        onClose();
      }
    },
    [onClose, onFlowStarted],
  );

  const runCommand = useCallback(
    (cmd: SlashCommand) => {
      const result = cmd.run();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setStack((prev) => [...prev, { kind: "loading" }]);
        onFlowStarted();
        void handleFlowResult(result, true);
      } else {
        void handleFlowResult(result, false);
      }
    },
    [handleFlowResult, onFlowStarted],
  );

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      runByName: (name: string) => {
        const cmd = commands.find((c) => c.name === name);
        if (!cmd) return false;
        runCommand(cmd);
        return true;
      },
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, commands, runCommand]);

  const goBack = useCallback(() => {
    setStack((prev) => {
      if (prev.length <= 1) {
        onClose();
        return prev;
      }
      // Leaving a flow back to the command list closes instead — the filter
      // text that opened the list is already consumed.
      const next = prev.slice(0, -1);
      if (next.length === 1 && next[0].kind === "commands") {
        onClose();
        return prev;
      }
      return next;
    });
  }, [onClose]);

  const activate = useCallback(
    (index: number) => {
      if (view.kind === "commands") {
        const row = commandRows[index];
        if (row?.cmd) runCommand(row.cmd);
        return;
      }
      if (view.kind === "picker") {
        const item = view.spec.items[index];
        if (!item || item.disabled) return;
        if (view.spec.checkbox) {
          setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(item.value)) next.delete(item.value);
            else next.add(item.value);
            return next;
          });
          return;
        }
        if (view.spec.onSelect) {
          const result = view.spec.onSelect(item.value);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            setStack((prev) => [...prev, { kind: "loading" }]);
            void handleFlowResult(result, true);
          } else {
            void handleFlowResult(result, false);
          }
        }
      }
    },
    [view, commandRows, runCommand, handleFlowResult],
  );

  const commitCheckbox = useCallback(() => {
    if (view.kind !== "picker" || !view.spec.checkbox || !view.spec.onCommit) return;
    const result = view.spec.onCommit([...checked]);
    setStack((prev) => [...prev, { kind: "loading" }]);
    void handleFlowResult(result, true);
  }, [view, checked, handleFlowResult]);

  // Global keyboard handling for commands/picker views. The input view owns
  // its own <input>.
  useEffect(() => {
    if (view.kind === "input" || view.kind === "loading") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const pos = selectableIndices.indexOf(selected);
        const nextPos = e.key === "ArrowDown"
          ? Math.min(pos + 1, selectableIndices.length - 1)
          : Math.max(pos - 1, 0);
        setSelected(selectableIndices[nextPos] ?? selected);
      } else if (e.key === "Enter" || (view.kind === "commands" && e.key === "Tab")) {
        e.preventDefault();
        e.stopPropagation();
        if (view.kind === "picker" && view.spec.checkbox) {
          commitCheckbox();
        } else {
          activate(selected);
        }
      } else if (e.key === " " && view.kind === "picker" && view.spec.checkbox) {
        e.preventDefault();
        e.stopPropagation();
        activate(selected);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        goBack();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [view, selected, selectableIndices, activate, goBack, commitCheckbox]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, view]);

  if (view.kind === "commands" && commandRows.length === 0) return null;

  return (
    <div className="slash-panel" ref={listRef}>
      {view.kind === "commands" &&
        commandRows.map((row, i) =>
          row.header ? (
            <div key={`h-${row.header}`} className="slash-group-label">{row.header}</div>
          ) : (
            <div
              key={row.cmd!.name}
              data-idx={i}
              className={i === selected ? "slash-item selected" : "slash-item"}
              onClick={() => activate(i)}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="slash-name">{row.cmd!.name}</span>
              <span className="slash-desc">{row.cmd!.description}</span>
            </div>
          ),
        )}

      {view.kind === "loading" && (
        <div className="slash-item" style={{ color: "var(--f-faint)", cursor: "default" }}>Loading…</div>
      )}

      {view.kind === "picker" && (
        <>
          <div className="popup-title">{view.spec.title}</div>
          {view.spec.items.length === 0 && (
            <div className="slash-item" style={{ color: "var(--f-faint)", cursor: "default" }}>
              {view.spec.emptyText ?? "Nothing here"}
            </div>
          )}
          {view.spec.items.map((item, i) => (
            <div
              key={`${item.value}-${i}`}
              data-idx={i}
              className={
                item.disabled
                  ? "slash-item"
                  : i === selected
                    ? "slash-item selected"
                    : "slash-item"
              }
              style={item.disabled ? { color: "var(--f-faint)", cursor: "default" } : undefined}
              onClick={() => !item.disabled && activate(i)}
              onMouseEnter={() => !item.disabled && setSelected(i)}
            >
              {view.spec.checkbox && !item.disabled && (
                <span style={{ width: 14, display: "flex", flexShrink: 0, color: checked.has(item.value) ? "var(--f-accent)" : "var(--f-faint)" }}>
                  {checked.has(item.value) ? <IconCheck size={12} /> : <span style={{ width: 12 }} />}
                </span>
              )}
              <span className="slash-name" style={{ fontFamily: "var(--vscode-font-family)" }}>{item.label}</span>
              {item.description && <span className="slash-desc">{item.description}</span>}
              {item.detail && <span className="slash-desc" style={{ marginLeft: "auto", flexShrink: 0 }}>{item.detail}</span>}
              {item.active && (
                <span style={{ marginLeft: "auto", display: "flex", flexShrink: 0, color: "var(--f-accent)" }}>
                  <IconCheck size={12} />
                </span>
              )}
              {!item.active && !view.spec.checkbox && view.spec.onSelect && !item.disabled && i === selected && (
                <span style={{ marginLeft: "auto", display: "flex", flexShrink: 0, color: "var(--f-faint)" }}>
                  <IconChevronRight size={10} />
                </span>
              )}
            </div>
          ))}
          {view.spec.checkbox && (
            <div className="slash-group-label" style={{ textTransform: "none", letterSpacing: 0 }}>
              Space toggles · Enter applies · Esc cancels
            </div>
          )}
        </>
      )}

      {view.kind === "input" && (
        <div style={{ padding: "6px 8px 8px" }}>
          <div className="popup-title" style={{ padding: "0 2px 5px" }}>{view.spec.title}</div>
          <input
            className="init-input"
            style={{ marginTop: 0 }}
            value={inputText}
            placeholder={view.spec.placeholder}
            autoFocus
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (!inputText.trim() && !view.spec.allowEmpty) return;
                const result = view.spec.onSubmit(inputText);
                setStack((prev) => [...prev, { kind: "loading" }]);
                void handleFlowResult(result, true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                goBack();
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
