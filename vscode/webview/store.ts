import { create } from "zustand";
import { rpcRequest, onEvent } from "./vscode-api.js";
import type {
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
  logEntries: LogEntry[];
  logRevision: number;
  activeLogEntryId: string | null;

  // Ask
  pendingAsk: AskPayload | null;

  // Models
  models: ModelDescriptor[];

  // Init wizard
  configStatus: ConfigStatus | null;

  // Actions
  initialize(): void;
  submitTurn(input: string): Promise<void>;
  resolveAsk(askId: string, choiceIndex: number): Promise<void>;
  denyAsk(): Promise<void>;
  interruptTurn(): Promise<void>;
  refreshLog(): Promise<void>;
  refreshModels(): Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  mode: "loading",
  errorMessage: null,
  meta: null,
  status: null,
  logEntries: [],
  logRevision: -1,
  activeLogEntryId: null,
  pendingAsk: null,
  models: [],
  configStatus: null,

  initialize() {
    // Server ready → session mode
    onEvent("ready", (params) => {
      const meta = params as SessionMeta;
      set({ mode: "chat", meta });
      get().refreshLog();
      get().refreshModels();
    });

    // Needs init → wizard mode
    onEvent("needs_init", () => {
      set({ mode: "init" });
      rpcRequest<ConfigStatus>("init.checkConfig").then((status) => {
        set({ configStatus: status });
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

    // Model change
    onEvent("model.changed", (params) => {
      const p = params as { name: string };
      const meta = get().meta;
      if (meta) {
        set({ meta: { ...meta, modelConfigName: p.name } });
      }
    });

    // Turn events
    onEvent("turn.started", () => {
      const status = get().status;
      if (status) set({ status: { ...status, currentTurnRunning: true } });
    });
    onEvent("turn.ended", () => {
      const status = get().status;
      if (status) set({ status: { ...status, currentTurnRunning: false } });
    });

    // Session reset
    onEvent("session.reset", () => {
      set({
        logEntries: [],
        logRevision: -1,
        activeLogEntryId: null,
        pendingAsk: null,
        meta: null,
        status: null,
        mode: "loading",
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
}));
