import { create } from "zustand";
import { rpcRequest, onEvent } from "./vscode-api.js";
import type {
  ConversationEntry,
  LogEntry,
  SessionMeta,
  SessionStatus,
  AskPayload,
  ModelDescriptor,
  ConfigStatus,
} from "../src/types.js";

export type AppMode = "loading" | "init" | "chat" | "binary-not-found" | "error";

interface StoreState {
  mode: AppMode;
  errorMessage: string | null;

  // Session
  meta: SessionMeta | null;
  status: SessionStatus | null;
  /** Server-projected conversation (capability "projectedLog"). */
  conversation: ConversationEntry[];
  /** Raw log fallback for pre-Phase-3 binaries without projectedLog. */
  logEntries: LogEntry[];
  logRevision: number;
  activeLogEntryId: string | null;
  /** Error message from the last failed turn (turn.ended status "error"). */
  lastTurnError: string | null;

  // Ask
  pendingAsk: AskPayload | null;

  // Models
  models: ModelDescriptor[];

  // Init wizard
  configStatus: ConfigStatus | null;

  // Capability helpers
  hasCapability(name: string): boolean;

  // Actions
  initialize(): void;
  submitTurn(input: string): Promise<void>;
  resolveAsk(askId: string, choiceIndex: number): Promise<void>;
  denyAsk(): Promise<void>;
  interruptTurn(): Promise<void>;
  refreshLog(): Promise<void>;
  refreshModels(): Promise<void>;
  refreshStatus(): Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  mode: "loading",
  errorMessage: null,
  meta: null,
  status: null,
  conversation: [],
  logEntries: [],
  logRevision: -1,
  activeLogEntryId: null,
  lastTurnError: null,
  pendingAsk: null,
  models: [],
  configStatus: null,

  hasCapability(name: string): boolean {
    return get().meta?.capabilities?.includes(name) ?? false;
  },

  initialize() {
    // Server ready → session mode
    onEvent("ready", (params) => {
      const meta = params as SessionMeta;
      set({ mode: "chat", meta });
      get().refreshLog();
      get().refreshModels();
      get().refreshStatus();
    });

    // Needs init → wizard mode
    onEvent("needs_init", () => {
      set({ mode: "init" });
      rpcRequest<ConfigStatus>("init.checkConfig").then((status) => {
        set({ configStatus: status });
      });
    });

    // New session starting — clear log but stay in chat mode
    onEvent("session.starting", (params) => {
      const p = params as { modelConfigName?: string };
      const currentMeta = get().meta;
      set({
        conversation: [],
        logEntries: [],
        logRevision: -1,
        activeLogEntryId: null,
        lastTurnError: null,
        pendingAsk: null,
        status: null,
        meta: currentMeta
          ? { ...currentMeta, title: "New session", turnCount: 0, modelConfigName: p.modelConfigName || currentMeta.modelConfigName }
          : null,
      });
    });

    // Binary not found
    onEvent("binary_not_found", () => {
      set({ mode: "binary-not-found" });
    });

    // Error
    onEvent("error", (params) => {
      const p = params as { message: string };
      set({ mode: "error", errorMessage: p.message });
    });

    // Log changes
    onEvent("log.changed", (params) => {
      const p = params as {
        revision: number;
        activeLogEntryId: string | null;
        status: SessionStatus;
      };
      set({ status: p.status, activeLogEntryId: p.activeLogEntryId });
      if (p.revision !== get().logRevision) {
        get().refreshLog();
      }
    });

    // Ask events
    onEvent("ask.pending", (params) => {
      set({ pendingAsk: params as AskPayload });
    });
    onEvent("ask.resolved", () => {
      set({ pendingAsk: null });
    });

    // Permission change
    onEvent("permission.changed", (params) => {
      const p = params as { mode: string };
      const status = get().status;
      if (status) {
        set({ status: { ...status, permissionMode: p.mode } });
      }
    });

    // Model change
    onEvent("model.changed", (params) => {
      const p = params as { name: string };
      const meta = get().meta;
      if (meta) {
        set({ meta: { ...meta, modelConfigName: p.name } });
      }
    });

    // Turn events. The runtime emits these for every turn (incl. auto-resume
    // on capable binaries). Status "waiting" = parked on a pending ask: the
    // AskPanel takes over, so the working spinner clears like any other end.
    onEvent("turn.started", () => {
      const status = get().status;
      set({
        lastTurnError: null,
        ...(status ? { status: { ...status, currentTurnRunning: true } } : {}),
      });
    });
    onEvent("turn.ended", (params) => {
      const p = (params ?? {}) as { status?: string; error?: string };
      const status = get().status;
      set({
        // Surface the error even when the (legacy) log has no entry for it.
        lastTurnError: p.status === "error" ? (p.error ?? "Turn failed") : null,
        ...(status
          ? {
              status: {
                ...status,
                currentTurnRunning: false,
                lastTurnEndStatus: typeof p.status === "string" ? p.status : status.lastTurnEndStatus,
              },
            }
          : {}),
      });
    });

    // Fatal server failures. server.crashed arrives right before the process
    // dies (capability "crashEvent"); server.exited comes from the extension
    // watching the child process. Without these the UI froze silently.
    onEvent("server.crashed", (params) => {
      const p = (params ?? {}) as { error?: string; origin?: string };
      set({
        mode: "error",
        errorMessage: `Fermi server crashed: ${p.error ?? "unknown error"}. Use "Fermi: New Session" to restart.`,
      });
    });
    onEvent("server.exited", (params) => {
      // A crash event may already have set a more specific message.
      if (get().mode === "error") return;
      const p = (params ?? {}) as { code?: number | null };
      set({
        mode: "error",
        errorMessage: `Fermi server exited unexpectedly (code ${p.code ?? "unknown"}). Use "Fermi: New Session" to restart.`,
      });
    });

    // Session reset (legacy, kept for compat)
    onEvent("session.reset", () => {
      set({
        conversation: [],
        logEntries: [],
        logRevision: -1,
        activeLogEntryId: null,
        lastTurnError: null,
        pendingAsk: null,
      });
    });
  },

  async submitTurn(input: string) {
    await rpcRequest("session.submitTurn", { input });
  },

  async resolveAsk(askId: string, choiceIndex: number) {
    await rpcRequest("session.resolveApprovalAsk", { askId, choiceIndex });
    set({ pendingAsk: null });
  },

  async denyAsk() {
    await rpcRequest("session.denyPendingAsk");
    set({ pendingAsk: null });
  },

  async interruptTurn() {
    await rpcRequest("session.requestTurnInterrupt");
  },

  async refreshLog() {
    try {
      if (get().hasCapability("projectedLog")) {
        const snapshot = await rpcRequest<{
          revision: number;
          entries: ConversationEntry[];
          activeLogEntryId: string | null;
        }>("session.getProjectedLog");
        set({
          conversation: snapshot.entries,
          logRevision: snapshot.revision,
          activeLogEntryId: snapshot.activeLogEntryId,
        });
        return;
      }
      // Legacy binary: fall back to the raw log + webview-side pairing.
      const snapshot = await rpcRequest<{
        revision: number;
        entries: LogEntry[];
        activeLogEntryId: string | null;
      }>("session.getLogSnapshot");
      set({
        logEntries: snapshot.entries,
        logRevision: snapshot.revision,
        activeLogEntryId: snapshot.activeLogEntryId,
      });
    } catch {}
  },

  async refreshModels() {
    try {
      const models = await rpcRequest<ModelDescriptor[]>("session.listAvailableModels");
      set({ models });
    } catch {}
  },

  async refreshStatus() {
    try {
      const s = await rpcRequest<SessionStatus>("session.getStatus");
      set({ status: s });
    } catch {}
  },
}));
