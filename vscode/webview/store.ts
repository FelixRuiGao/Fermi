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
  PlanCheckpoint,
  SessionListItem,
  AgentQuestionAnswer,
  SkillInfo,
  ChildSessionSnapshot,
  ShellSnapshot,
  ModelCatalogNode,
} from "../src/types.js";

/** Local, non-persisted cards that slash info-commands insert into the transcript. */
export type InfoCard =
  | { id: number; kind: "help" }
  | { id: number; kind: "usage" }
  | { id: number; kind: "mcp"; data: unknown }
  | { id: number; kind: "hooks"; data: unknown }
  | { id: number; kind: "text"; title: string; body: string; mono?: boolean };

let nextCardId = 1;

/** Omit that distributes over unions (plain Omit collapses InfoCard's variants). */
export type NewInfoCard = InfoCard extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

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
  /** Grouped model catalog (capability "modelCatalog"); empty on old binaries. */
  modelCatalog: ModelCatalogNode[];

  // Plan (todo checklist projected from the model's plan.md)
  plan: PlanCheckpoint[];

  // Project session history (for Home + header history)
  sessions: SessionListItem[];

  // Agent mode / goal / skills (feature parity with the TUI)
  agentMode: string;
  goal: string | null;
  skills: SkillInfo[];

  // Live child agents + background shells (watchEvents push)
  children: ChildSessionSnapshot[];
  shells: ShellSnapshot[];

  // Transient info cards appended to the transcript by info commands
  infoCards: InfoCard[];

  // Init wizard
  configStatus: ConfigStatus | null;

  // Capability helpers
  hasCapability(name: string): boolean;

  // Actions
  initialize(): void;
  submitTurn(input: string): Promise<void>;
  resolveAsk(askId: string, choiceIndex: number): Promise<void>;
  resolveQuestionAsk(askId: string, answers: AgentQuestionAnswer[]): Promise<void>;
  denyAsk(): Promise<void>;
  interruptTurn(): Promise<void>;
  refreshLog(): Promise<void>;
  refreshModels(): Promise<void>;
  refreshModelCatalog(): Promise<void>;
  refreshStatus(): Promise<void>;
  refreshPlan(): Promise<void>;
  refreshSessions(): Promise<void>;
  restoreSession(sessionId: string): Promise<void>;
  refreshMode(): Promise<void>;
  refreshGoal(): Promise<void>;
  refreshSkills(): Promise<void>;
  refreshLiveActivity(): Promise<void>;
  addInfoCard(card: NewInfoCard): void;
  dismissInfoCard(id: number): void;
}

/**
 * Compatibility shim for pre-auto-resume binaries: current servers resume the
 * parked turn themselves when an ask is resolved over RPC; older ones left
 * the session suspended forever. If the turn is still parked after resolving,
 * kick it. On current binaries this is a no-op (hasPendingTurn is already
 * consumed), and a lost double-resume is harmless (resumes are serialized and
 * an empty pending state returns immediately).
 */
async function resumeIfStillParked(): Promise<void> {
  try {
    const status = await rpcRequest<SessionStatus>("session.getStatus");
    if (status?.hasPendingTurn) {
      await rpcRequest("session.resumePendingTurn");
    }
  } catch {}
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
  modelCatalog: [],
  plan: [],
  sessions: [],
  agentMode: "default",
  goal: null,
  skills: [],
  children: [],
  shells: [],
  infoCards: [],
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
      get().refreshModelCatalog();
      get().refreshStatus();
      get().refreshPlan();
      get().refreshSessions();
      get().refreshMode();
      get().refreshGoal();
      get().refreshSkills();
      // Watcher events only fire on CHANGE — a webview that (re)attaches
      // mid-run needs the current snapshots or it shows no agents/shells
      // until the next digest flip.
      get().refreshLiveActivity();
    });

    // Needs init → wizard mode
    onEvent("needs_init", () => {
      set({ mode: "init" });
      rpcRequest<ConfigStatus>("init.checkConfig").then((status) => {
        set({ configStatus: status });
      });
    });

    // New session starting — clear ALL per-session state but stay in chat
    // mode. Anything left out here haunts the new session until the ready
    // refresh lands (info cards and live chips famously survived /new).
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
        plan: [],
        goal: null,
        agentMode: "default",
        children: [],
        shells: [],
        infoCards: [],
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

    // Plan checklist changes
    onEvent("plan.changed", (params) => {
      const p = params as { state?: PlanCheckpoint[] };
      set({ plan: Array.isArray(p?.state) ? p.state : [] });
    });

    // Agent mode changes (from /mode here or in a parallel TUI on the same session)
    onEvent("mode.changed", (params) => {
      const p = params as { mode?: string };
      if (typeof p?.mode === "string") set({ agentMode: p.mode });
    });

    // Thinking level changes (from /model chain or setThinkingLevel)
    onEvent("thinking.changed", (params) => {
      const p = params as { level?: string };
      const meta = get().meta;
      if (meta && typeof p?.level === "string") {
        set({ meta: { ...meta, thinkingLevel: p.level } });
      }
    });

    // Skills toggled (here, in a parallel client, or via the reload tool)
    onEvent("skills.changed", (params) => {
      const p = params as { skills?: SkillInfo[] };
      if (Array.isArray(p?.skills)) set({ skills: p.skills });
    });

    // Watcher pushes: live child agents and background shells
    onEvent("child.changed", (params) => {
      const p = params as { children?: ChildSessionSnapshot[] };
      if (Array.isArray(p?.children)) set({ children: p.children });
    });
    onEvent("shells.changed", (params) => {
      const p = params as { shells?: ShellSnapshot[] };
      if (Array.isArray(p?.shells)) set({ shells: p.shells });
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
      const p = params as { mode: SessionStatus["permissionMode"] };
      const status = get().status;
      if (status) {
        set({ status: { ...status, permissionMode: p.mode } });
      }
    });

    // Model change
    onEvent("model.changed", (params) => {
      const p = params as { name: string; displayLabel?: string };
      const meta = get().meta;
      if (meta) {
        set({
          meta: {
            ...meta,
            modelConfigName: p.name,
            ...(p.displayLabel ? { modelDisplayLabel: p.displayLabel } : {}),
          },
        });
      }
      // The current-model marker moved — refresh the grouped catalog so its
      // "current" highlight tracks (a switch may also have auto-created a
      // runtime config, adding a new entry).
      get().refreshModelCatalog();
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

  },

  async submitTurn(input: string) {
    await rpcRequest("session.submitTurn", { input });
  },

  async resolveAsk(askId: string, choiceIndex: number) {
    await rpcRequest("session.resolveApprovalAsk", { askId, choiceIndex });
    set({ pendingAsk: null });
    await resumeIfStillParked();
  },

  async resolveQuestionAsk(askId: string, answers: AgentQuestionAnswer[]) {
    await rpcRequest("session.resolveAgentQuestionAsk", { askId, decision: { answers } });
    set({ pendingAsk: null });
    await resumeIfStillParked();
  },

  async denyAsk() {
    await rpcRequest("session.denyPendingAsk");
    set({ pendingAsk: null });
    await resumeIfStillParked();
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

  async refreshModelCatalog() {
    if (!get().hasCapability("modelCatalog")) return;
    try {
      const catalog = await rpcRequest<ModelCatalogNode[]>("session.getModelCatalog");
      set({ modelCatalog: Array.isArray(catalog) ? catalog : [] });
    } catch {}
  },

  async refreshStatus() {
    try {
      const s = await rpcRequest<SessionStatus>("session.getStatus");
      set({ status: s });
    } catch {}
  },

  async refreshPlan() {
    try {
      const plan = await rpcRequest<PlanCheckpoint[]>("session.getPlanState");
      set({ plan: Array.isArray(plan) ? plan : [] });
    } catch {}
  },

  async refreshSessions() {
    try {
      const sessions = await rpcRequest<SessionListItem[]>("session.listProjectSessions");
      set({ sessions: sessions ?? [] });
    } catch {}
  },

  async restoreSession(sessionId: string) {
    // Server emits ready + log.changed on success, which refresh everything —
    // except client-local surfaces, which must not leak across sessions.
    await rpcRequest("session.restoreSession", { sessionId });
    set({ infoCards: [], children: [], shells: [], lastTurnError: null, pendingAsk: null });
  },

  async refreshMode() {
    try {
      const r = await rpcRequest<{ mode?: string }>("session.getMode");
      if (typeof r?.mode === "string") set({ agentMode: r.mode });
    } catch {}
  },

  async refreshGoal() {
    try {
      const r = await rpcRequest<{ goal?: string | null }>("session.getGoal");
      set({ goal: r?.goal ?? null });
    } catch {}
  },

  async refreshSkills() {
    try {
      const skills = await rpcRequest<SkillInfo[]>("session.listSkills");
      set({ skills: Array.isArray(skills) ? skills : [] });
    } catch {}
  },

  async refreshLiveActivity() {
    try {
      const [children, shells] = await Promise.all([
        rpcRequest<ChildSessionSnapshot[]>("session.getChildSnapshots"),
        rpcRequest<ShellSnapshot[]>("session.getBackgroundShellSnapshots"),
      ]);
      set({
        children: Array.isArray(children) ? children : [],
        shells: Array.isArray(shells) ? shells : [],
      });
    } catch {}
  },

  addInfoCard(card) {
    set({ infoCards: [...get().infoCards, { ...card, id: nextCardId++ } as InfoCard] });
  },

  dismissInfoCard(id) {
    set({ infoCards: get().infoCards.filter((c) => c.id !== id) });
  },
}));
