/**
 * Renderer state store.
 *
 * Holds top-level UI state (tabs, active tab, theme, history) plus a per-tab
 * projection of everything the fermi server exposes over the wire. Each tab is
 * one `fermi --server` subprocess; this store subscribes once to `rpc:event`
 * and routes every event to the right tab.
 *
 * The renderer consumes the SERVER-SIDE projection (`session.getProjectedLog`
 * → ConversationEntry[]) and the control-plane push events — it never re-pairs
 * raw LogEntry[] or re-implements command/state semantics on the client.
 */

import { create } from 'zustand'
import { api } from '@/lib/api.js'
import type {
  AgentQuestionAnswer,
  AskPayload,
  ChildSessionSnapshot,
  ConfigStatus,
  ConversationEntry,
  ModelCatalogNode,
  ModelDescriptor,
  PlanCheckpoint,
  RpcEvent,
  SessionMeta,
  SessionStatus,
  SessionTab,
  ShellSnapshot,
  SkillInfo,
  WorkspaceHistoryGroup,
} from '@shared/rpc.js'

export interface TabState {
  readonly meta: SessionMeta | null
  readonly status: SessionStatus | null
  /** Server-projected conversation (capability "projectedLog"). */
  readonly conversation: readonly ConversationEntry[]
  readonly logRevision: number
  readonly activeLogEntryId: string | null
  /** Error message from the last failed turn (turn.ended status "error"). */
  readonly lastTurnError: string | null
  readonly pendingAsk: AskPayload | null
  readonly models: readonly ModelDescriptor[]
  /** Grouped model catalog (capability "modelCatalog"). */
  readonly modelCatalog: readonly ModelCatalogNode[]
  readonly plan: readonly PlanCheckpoint[]
  readonly agentMode: string
  readonly goal: string | null
  readonly skills: readonly SkillInfo[]
  /** Live child agents + background shells (watchEvents push). */
  readonly children: readonly ChildSessionSnapshot[]
  readonly shells: readonly ShellSnapshot[]
  /** True while the subprocess is in init-wizard mode (no providers). */
  readonly needsInit: boolean
  readonly configStatus: ConfigStatus | null
  readonly stderrLog: readonly string[]
}

interface SessionStoreState {
  readonly tabs: readonly SessionTab[]
  readonly activeTabId: string | null
  readonly perTab: Record<string, TabState>
  readonly theme: 'dark' | 'light'
  readonly markdownMode: 'rendered' | 'raw'
  readonly autoUpdate: boolean
  readonly history: readonly WorkspaceHistoryGroup[]
  readonly initialized: boolean
  readonly bootstrapped: boolean
  // Last known set of available models from any live tab — read-only fallback
  // for a draft tab's picker (drafts have no subprocess yet).
  readonly globalModels: readonly ModelDescriptor[]
  readonly globalModelCatalog: readonly ModelCatalogNode[]

  init(): Promise<void>
  setTheme(theme: 'dark' | 'light'): void
  useSystemTheme(): Promise<void>
  setMarkdownMode(mode: 'rendered' | 'raw'): void
  toggleMarkdownMode(): void
  refreshSettings(): Promise<void>
  setAutoUpdate(enabled: boolean): Promise<void>
  refreshHistory(): Promise<void>
  createDraftTab(workDir: string): SessionTab
  createTab(workDir: string): Promise<SessionTab | null>
  openHistorySession(workDir: string, sessionId: string): Promise<SessionTab | null>
  archiveHistorySession(workDir: string, sessionId: string): Promise<void>
  setHistorySessionPinned(workDir: string, sessionId: string, pinned: boolean): Promise<void>
  closeTab(tabId: string): Promise<void>
  setActiveTab(tabId: string | null): void

  hasCapability(tabId: string, name: string): boolean
  request<T = unknown>(tabId: string, method: string, params?: unknown): Promise<T>

  refreshMeta(tabId: string): Promise<void>
  refreshLog(tabId: string): Promise<void>
  refreshStatus(tabId: string): Promise<void>
  refreshModels(tabId: string): Promise<void>
  refreshModelCatalog(tabId: string): Promise<void>
  refreshPlan(tabId: string): Promise<void>
  refreshMode(tabId: string): Promise<void>
  refreshGoal(tabId: string): Promise<void>
  refreshSkills(tabId: string): Promise<void>
  refreshLiveActivity(tabId: string): Promise<void>
  refreshAll(tabId: string): void

  submitTurn(tabId: string, input: string, attachments?: readonly InlineAttachment[]): Promise<void>
  selectModel(tabId: string, modelName: string, thinkingLevel?: string): Promise<void>
  setPermissionMode(tabId: string, mode: SessionStatus['permissionMode']): Promise<void>
  resolveApprovalAsk(tabId: string, askId: string, choiceIndex: number): Promise<void>
  resolveAgentQuestionAsk(tabId: string, askId: string, answers: AgentQuestionAnswer[]): Promise<void>
  denyAsk(tabId: string): Promise<void>
  interruptTurn(tabId: string): Promise<void>
}

/** Clipboard / drag-drop image attachment sent with a turn. */
export interface InlineAttachment {
  /** Base64 (no data: prefix) or a data URL. */
  data: string
  mimeType: string
  name?: string
}

const emptyTabState: TabState = {
  meta: null,
  status: null,
  conversation: [],
  logRevision: -1,
  activeLogEntryId: null,
  lastTurnError: null,
  pendingAsk: null,
  models: [],
  modelCatalog: [],
  plan: [],
  agentMode: 'default',
  goal: null,
  skills: [],
  children: [],
  shells: [],
  needsInit: false,
  configStatus: null,
  stderrLog: [],
}

const ACTIVE_TAB_KEY = 'fermi:activeTabId'
const MARKDOWN_MODE_KEY = 'fermi:markdownMode'

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  perTab: {},
  theme: 'dark',
  markdownMode: readStoredMarkdownMode(),
  autoUpdate: true,
  history: [],
  initialized: false,
  bootstrapped: false,
  globalModels: [],
  globalModelCatalog: [],

  async init() {
    if (get().initialized) return
    set({ initialized: true })

    try {
      const stored = localStorage.getItem('fermi:theme') as 'dark' | 'light' | null
      const theme = stored ?? (await api.theme.getSystem())
      applyTheme(theme)
      set({ theme })
    } catch {
      // ignore
    }

    api.theme.onSystemChanged((theme) => {
      if (!localStorage.getItem('fermi:theme')) get().setTheme(theme)
    })

    void get().refreshSettings()
    void get().refreshHistory()

    api.rpc.onEvent((e) => handleEvent(e))

    // Re-attach to subprocesses the main process still supervises after a
    // renderer reload.
    const tabs = await api.tabs.list()
    const perTab = { ...get().perTab }
    for (const t of tabs) perTab[t.tabId] = { ...emptyTabState }
    const storedActiveTabId = readStoredActiveTabId()
    set({
      tabs,
      perTab,
      activeTabId:
        get().activeTabId ??
        (storedActiveTabId && tabs.some((t) => t.tabId === storedActiveTabId) ? storedActiveTabId : null) ??
        tabs[0]?.tabId ??
        null,
    })
    for (const t of tabs) get().refreshAll(t.tabId)
    set({ bootstrapped: true })
  },

  setTheme(theme) {
    set({ theme })
    applyTheme(theme)
    try {
      localStorage.setItem('fermi:theme', theme)
    } catch {
      // ignore
    }
  },

  async useSystemTheme() {
    try {
      localStorage.removeItem('fermi:theme')
    } catch {
      // ignore
    }
    try {
      const theme = await api.theme.getSystem()
      set({ theme })
      applyTheme(theme)
    } catch {
      // ignore
    }
  },

  setMarkdownMode(markdownMode) {
    set({ markdownMode })
    try {
      localStorage.setItem(MARKDOWN_MODE_KEY, markdownMode)
    } catch {
      // ignore
    }
  },

  toggleMarkdownMode() {
    get().setMarkdownMode(get().markdownMode === 'rendered' ? 'raw' : 'rendered')
  },

  async refreshSettings() {
    try {
      const settings = await api.settings.get()
      set({ autoUpdate: settings.autoUpdate })
    } catch {
      // ignore
    }
  },

  async setAutoUpdate(enabled) {
    try {
      const settings = await api.settings.setAutoUpdate(enabled)
      set({ autoUpdate: settings.autoUpdate })
    } catch (err) {
      console.error('setAutoUpdate failed', err)
    }
  },

  async refreshHistory() {
    try {
      const history = await api.history.listWorkspaces()
      set({ history })
    } catch (err) {
      console.error('refreshHistory failed', err)
    }
  },

  createDraftTab(workDir) {
    const existing = get().tabs.find((tab) => tab.workDir === workDir && tab.status === 'draft')
    if (existing) {
      set({ activeTabId: existing.tabId })
      storeActiveTabId(existing.tabId)
      return existing
    }
    const now = Date.now()
    const tab: SessionTab = {
      tabId: `draft-${crypto.randomUUID()}`,
      workDir,
      sessionId: null,
      title: null,
      displayName: null,
      selectedModel: currentModelForWorkspace(get().tabs, workDir),
      modelProvider: null,
      createdAt: now,
      lastActiveAt: now,
      status: 'draft',
    }
    set({
      tabs: [...get().tabs, tab],
      activeTabId: tab.tabId,
      perTab: { ...get().perTab, [tab.tabId]: { ...emptyTabState } },
    })
    storeActiveTabId(tab.tabId)
    return tab
  },

  async createTab(workDir) {
    try {
      const tab = await api.tabs.create({ workDir })
      const tabs = [...get().tabs.filter((t) => t.tabId !== tab.tabId), tab]
      set({
        tabs,
        activeTabId: tab.tabId,
        perTab: { ...get().perTab, [tab.tabId]: { ...emptyTabState } },
      })
      storeActiveTabId(tab.tabId)
      get().refreshAll(tab.tabId)
      return tab
    } catch (err) {
      console.error('createTab failed', err)
      return null
    }
  },

  async openHistorySession(workDir, sessionId) {
    const existing = get().tabs.find((tab) => tab.sessionId === sessionId)
    if (existing) {
      set({ activeTabId: existing.tabId })
      storeActiveTabId(existing.tabId)
      return existing
    }

    const tab = await get().createTab(workDir)
    if (!tab) return null

    try {
      await api.rpc.request(tab.tabId, 'session.restoreSession', { sessionId })
      get().refreshAll(tab.tabId)
      void get().refreshHistory()
      return tab
    } catch (err) {
      console.error('openHistorySession failed', err)
      await get().closeTab(tab.tabId)
      return null
    }
  },

  async archiveHistorySession(workDir, sessionId) {
    const openTab = get().tabs.find((tab) => tab.sessionId === sessionId)
    if (openTab) await get().closeTab(openTab.tabId)
    try {
      await api.history.archiveSession({ workDir, sessionId })
      await get().refreshHistory()
    } catch (err) {
      console.error('archiveHistorySession failed', err)
    }
  },

  async setHistorySessionPinned(workDir, sessionId, pinned) {
    try {
      await api.history.setSessionPinned({ workDir, sessionId, pinned })
      await get().refreshHistory()
    } catch (err) {
      console.error('setHistorySessionPinned failed', err)
    }
  },

  async closeTab(tabId) {
    const existing = get().tabs.find((tab) => tab.tabId === tabId)
    if (existing?.status !== 'draft') {
      try {
        await api.tabs.close(tabId)
      } catch (err) {
        console.error('closeTab failed', err)
      }
    }
    const tabs = get().tabs.filter((t) => t.tabId !== tabId)
    const perTab = { ...get().perTab }
    delete perTab[tabId]
    let activeTabId = get().activeTabId
    if (activeTabId === tabId) activeTabId = tabs[0]?.tabId ?? null
    set({ tabs, perTab, activeTabId })
    storeActiveTabId(activeTabId)
  },

  setActiveTab(tabId) {
    if (tabId) touchTab(tabId)
    set({ activeTabId: tabId })
    storeActiveTabId(tabId)
  },

  hasCapability(tabId, name) {
    return get().perTab[tabId]?.meta?.capabilities?.includes(name) ?? false
  },

  request(tabId, method, params) {
    return api.rpc.request(tabId, method, params)
  },

  async refreshMeta(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const meta = await api.rpc.request<SessionMeta>(tabId, 'session.getMeta')
      patchTabState(tabId, () => ({ meta }))
      patchTabSnapshot(tabId, () => ({
        sessionId: meta.sessionId,
        title: meta.title ?? null,
        displayName: meta.displayName,
        selectedModel: meta.modelConfigName,
        modelProvider: meta.modelProvider,
      }))
    } catch {
      // ignore
    }
  },

  async refreshLog(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const result = await api.rpc.request<{
        revision: number
        entries: ConversationEntry[]
        activeLogEntryId: string | null
      }>(tabId, 'session.getProjectedLog', {})
      patchTabState(tabId, () => ({
        conversation: result.entries,
        logRevision: result.revision,
        activeLogEntryId: result.activeLogEntryId,
      }))
    } catch {
      // ignore
    }
  },

  async refreshStatus(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const status = await api.rpc.request<SessionStatus>(tabId, 'session.getStatus')
      patchTabState(tabId, () => ({ status }))
    } catch {
      // ignore
    }
  },

  async refreshModels(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const models = await api.rpc.request<ModelDescriptor[]>(tabId, 'session.listAvailableModels')
      patchTabState(tabId, () => ({ models }))
      if (Array.isArray(models) && models.length > 0) set({ globalModels: models })
    } catch {
      // ignore
    }
  },

  async refreshModelCatalog(tabId) {
    if (isDraft(get, tabId) || !get().hasCapability(tabId, 'modelCatalog')) return
    try {
      const catalog = await api.rpc.request<ModelCatalogNode[]>(tabId, 'session.getModelCatalog')
      const value = Array.isArray(catalog) ? catalog : []
      patchTabState(tabId, () => ({ modelCatalog: value }))
      if (value.length > 0) set({ globalModelCatalog: value })
    } catch {
      // ignore
    }
  },

  async refreshPlan(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const plan = await api.rpc.request<PlanCheckpoint[]>(tabId, 'session.getPlanState')
      patchTabState(tabId, () => ({ plan: Array.isArray(plan) ? plan : [] }))
    } catch {
      // ignore
    }
  },

  async refreshMode(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const r = await api.rpc.request<{ mode?: string }>(tabId, 'session.getMode')
      if (typeof r?.mode === 'string') patchTabState(tabId, () => ({ agentMode: r.mode! }))
    } catch {
      // ignore
    }
  },

  async refreshGoal(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const r = await api.rpc.request<{ goal?: string | null }>(tabId, 'session.getGoal')
      patchTabState(tabId, () => ({ goal: r?.goal ?? null }))
    } catch {
      // ignore
    }
  },

  async refreshSkills(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const skills = await api.rpc.request<SkillInfo[]>(tabId, 'session.listSkills')
      patchTabState(tabId, () => ({ skills: Array.isArray(skills) ? skills : [] }))
    } catch {
      // ignore
    }
  },

  async refreshLiveActivity(tabId) {
    if (isDraft(get, tabId)) return
    try {
      const [children, shells] = await Promise.all([
        api.rpc.request<ChildSessionSnapshot[]>(tabId, 'session.getChildSnapshots'),
        api.rpc.request<ShellSnapshot[]>(tabId, 'session.getBackgroundShellSnapshots'),
      ])
      patchTabState(tabId, () => ({
        children: Array.isArray(children) ? children : [],
        shells: Array.isArray(shells) ? shells : [],
      }))
    } catch {
      // ignore
    }
  },

  refreshAll(tabId) {
    const store = get()
    void store.refreshMeta(tabId)
    void store.refreshLog(tabId)
    void store.refreshStatus(tabId)
    void store.refreshModels(tabId)
    void store.refreshModelCatalog(tabId)
    void store.refreshPlan(tabId)
    void store.refreshMode(tabId)
    void store.refreshGoal(tabId)
    void store.refreshSkills(tabId)
    void store.refreshLiveActivity(tabId)
  },

  async submitTurn(tabId, input, attachments) {
    if (!input.trim() && (!attachments || attachments.length === 0)) return
    const params = attachments && attachments.length > 0 ? { input, attachments } : { input }
    try {
      const tab = get().tabs.find((item) => item.tabId === tabId)
      if (tab?.status === 'draft') {
        const realTab = await materializeDraftTab(get, tab)
        if (!realTab) return
        await api.rpc.request(realTab.tabId, 'session.submitTurn', params)
        return
      }
      touchTab(tabId)
      await api.rpc.request(tabId, 'session.submitTurn', params)
    } catch (err) {
      console.error('submitTurn failed', err)
    }
  },

  async selectModel(tabId, modelName, thinkingLevel) {
    const tab = get().tabs.find((item) => item.tabId === tabId)
    if (tab?.status === 'draft') {
      patchTabSnapshot(tabId, () => ({ selectedModel: modelName }))
      return
    }
    const params = thinkingLevel ? { name: modelName, thinkingLevel } : { name: modelName }
    try {
      await api.rpc.request(tabId, 'session.selectModel', params)
      void get().refreshMeta(tabId)
      void get().refreshModelCatalog(tabId)
    } catch (err) {
      console.error('selectModel failed', err)
      throw err
    }
  },

  async setPermissionMode(tabId, mode) {
    if (isDraft(get, tabId)) return
    try {
      const status = await api.rpc.request<SessionStatus>(tabId, 'session.setPermissionMode', { mode })
      patchTabState(tabId, () => ({ status }))
    } catch (err) {
      console.error('setPermissionMode failed', err)
    }
  },

  async resolveApprovalAsk(tabId, askId, choiceIndex) {
    await api.rpc.request(tabId, 'session.resolveApprovalAsk', { askId, choiceIndex })
    patchTabState(tabId, () => ({ pendingAsk: null }))
    await resumeIfStillParked(tabId)
  },

  async resolveAgentQuestionAsk(tabId, askId, answers) {
    await api.rpc.request(tabId, 'session.resolveAgentQuestionAsk', { askId, decision: { answers } })
    patchTabState(tabId, () => ({ pendingAsk: null }))
    await resumeIfStillParked(tabId)
  },

  async denyAsk(tabId) {
    await api.rpc.request(tabId, 'session.denyPendingAsk')
    patchTabState(tabId, () => ({ pendingAsk: null }))
    await resumeIfStillParked(tabId)
  },

  async interruptTurn(tabId) {
    try {
      await api.rpc.request(tabId, 'session.requestTurnInterrupt')
      void get().refreshStatus(tabId)
    } catch {
      // ignore
    }
  },
}))

// ── Internal helpers (bind to the singleton store) ──

function store(): SessionStoreState {
  return useSessionStore.getState()
}

function isDraft(get: () => SessionStoreState, tabId: string): boolean {
  return get().tabs.find((tab) => tab.tabId === tabId)?.status === 'draft'
}

function patchTabState(tabId: string, patch: (prev: TabState) => Partial<TabState>): void {
  const prev = store().perTab[tabId]
  if (!prev) return
  const next: TabState = { ...prev, ...patch(prev) }
  useSessionStore.setState({ perTab: { ...store().perTab, [tabId]: next } })
}

function patchTabSnapshot(tabId: string, patch: (prev: SessionTab) => Partial<SessionTab>): void {
  const tabs = store().tabs.map((tab) => (tab.tabId === tabId ? { ...tab, ...patch(tab) } : tab))
  useSessionStore.setState({ tabs })
}

function touchTab(tabId: string): void {
  patchTabSnapshot(tabId, () => ({ lastActiveAt: Date.now() }))
}

/**
 * Compatibility shim for pre-auto-resume binaries: current servers resume a
 * parked turn themselves when an ask resolves over RPC. If still parked after
 * resolving, kick it (a no-op on current binaries).
 */
async function resumeIfStillParked(tabId: string): Promise<void> {
  try {
    const status = await api.rpc.request<SessionStatus>(tabId, 'session.getStatus')
    if (status?.hasPendingTurn) await api.rpc.request(tabId, 'session.resumePendingTurn')
  } catch {
    // ignore
  }
}

async function materializeDraftTab(
  get: () => SessionStoreState,
  draft: SessionTab,
): Promise<SessionTab | null> {
  patchTabSnapshot(draft.tabId, () => ({ status: 'starting', lastActiveAt: Date.now() }))
  try {
    const realTab = await api.tabs.create({
      workDir: draft.workDir,
      selectedModel: draft.selectedModel ?? undefined,
    })
    const previousState = get().perTab[draft.tabId] ?? emptyTabState
    const tabs = get().tabs.map((tab) =>
      tab.tabId === draft.tabId
        ? { ...realTab, createdAt: draft.createdAt, lastActiveAt: Date.now() }
        : tab,
    )
    const perTab = { ...get().perTab }
    delete perTab[draft.tabId]
    perTab[realTab.tabId] = previousState
    useSessionStore.setState({ tabs, perTab, activeTabId: realTab.tabId })
    storeActiveTabId(realTab.tabId)
    get().refreshAll(realTab.tabId)
    return realTab
  } catch (err) {
    console.error('materializeDraftTab failed', err)
    patchTabSnapshot(draft.tabId, () => ({
      status: 'draft',
      errorMessage: err instanceof Error ? err.message : String(err),
    }))
    return null
  }
}

function handleEvent(e: RpcEvent): void {
  const { tabId, method, params } = e
  const s = store()
  // Events can arrive for a tab the renderer hasn't registered yet (a race on
  // create). Ignore those; the eager refreshAll will catch up.
  if (method !== 'ready' && method !== 'needs_init' && !s.perTab[tabId] && !s.tabs.some((t) => t.tabId === tabId)) {
    return
  }

  switch (method) {
    case 'ready': {
      touchTab(tabId)
      const meta = params as (Partial<SessionMeta> & { sessionId?: string }) | null
      if (meta) {
        patchTabSnapshot(tabId, (tab) => ({
          sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : tab.sessionId,
          title: typeof meta.title === 'string' ? meta.title : tab.title,
          displayName: typeof meta.displayName === 'string' ? meta.displayName : tab.displayName,
          selectedModel:
            typeof meta.modelConfigName === 'string' ? meta.modelConfigName : tab.selectedModel,
          modelProvider: typeof meta.modelProvider === 'string' ? meta.modelProvider : tab.modelProvider,
          status: 'ready',
          needsInit: false,
        }))
        patchTabState(tabId, () => ({ meta: meta as SessionMeta, needsInit: false }))
      }
      s.refreshAll(tabId)
      break
    }

    case 'needs_init': {
      patchTabSnapshot(tabId, () => ({ status: 'ready', needsInit: true }))
      patchTabState(tabId, () => ({ needsInit: true }))
      void api.rpc
        .request<ConfigStatus>(tabId, 'init.checkConfig')
        .then((configStatus) => patchTabState(tabId, () => ({ configStatus })))
        .catch(() => undefined)
      break
    }

    case 'session.starting': {
      // A new session is (re)starting in this tab — clear per-session state.
      patchTabState(tabId, () => ({
        conversation: [],
        logRevision: -1,
        activeLogEntryId: null,
        lastTurnError: null,
        pendingAsk: null,
        status: null,
        plan: [],
        goal: null,
        agentMode: 'default',
        children: [],
        shells: [],
      }))
      break
    }

    case 'log.changed': {
      touchTab(tabId)
      const p = params as { revision?: number; status?: SessionStatus; activeLogEntryId?: string | null }
      patchTabState(tabId, (prev) => ({
        ...(p.status ? { status: p.status } : {}),
        activeLogEntryId: p.activeLogEntryId ?? prev.activeLogEntryId,
      }))
      if (typeof p.revision === 'number' && p.revision !== s.perTab[tabId]?.logRevision) {
        void s.refreshLog(tabId)
      } else {
        void s.refreshLog(tabId)
      }
      break
    }

    case 'plan.changed': {
      const p = params as { state?: PlanCheckpoint[] }
      patchTabState(tabId, () => ({ plan: Array.isArray(p?.state) ? p.state : [] }))
      break
    }

    case 'mode.changed': {
      const p = params as { mode?: string }
      if (typeof p?.mode === 'string') patchTabState(tabId, () => ({ agentMode: p.mode! }))
      break
    }

    case 'thinking.changed': {
      const p = params as { level?: string }
      patchTabState(tabId, (prev) =>
        prev.meta && typeof p?.level === 'string'
          ? { meta: { ...prev.meta, thinkingLevel: p.level } }
          : {},
      )
      break
    }

    case 'skills.changed': {
      const p = params as { skills?: SkillInfo[] }
      if (Array.isArray(p?.skills)) patchTabState(tabId, () => ({ skills: p.skills! }))
      break
    }

    case 'child.changed': {
      const p = params as { children?: ChildSessionSnapshot[] }
      if (Array.isArray(p?.children)) patchTabState(tabId, () => ({ children: p.children! }))
      break
    }

    case 'shells.changed': {
      const p = params as { shells?: ShellSnapshot[] }
      if (Array.isArray(p?.shells)) patchTabState(tabId, () => ({ shells: p.shells! }))
      break
    }

    case 'ask.pending': {
      patchTabState(tabId, () => ({ pendingAsk: params as AskPayload }))
      break
    }

    case 'ask.resolved': {
      patchTabState(tabId, () => ({ pendingAsk: null }))
      break
    }

    case 'permission.changed': {
      const p = params as { mode?: SessionStatus['permissionMode'] }
      patchTabState(tabId, (prev) =>
        prev.status && p?.mode ? { status: { ...prev.status, permissionMode: p.mode } } : {},
      )
      break
    }

    case 'model.changed': {
      const p = params as { name?: string; displayLabel?: string }
      patchTabState(tabId, (prev) =>
        prev.meta
          ? {
              meta: {
                ...prev.meta,
                ...(typeof p?.name === 'string' ? { modelConfigName: p.name } : {}),
                ...(p?.displayLabel ? { modelDisplayLabel: p.displayLabel } : {}),
              },
            }
          : {},
      )
      if (typeof p?.name === 'string') patchTabSnapshot(tabId, () => ({ selectedModel: p.name! }))
      void s.refreshModelCatalog(tabId)
      break
    }

    case 'turn.started': {
      touchTab(tabId)
      patchTabState(tabId, (prev) => ({
        lastTurnError: null,
        ...(prev.status ? { status: { ...prev.status, currentTurnRunning: true } } : {}),
      }))
      void s.refreshStatus(tabId)
      break
    }

    case 'turn.ended': {
      const p = (params ?? {}) as { status?: string; error?: string }
      patchTabState(tabId, (prev) => ({
        lastTurnError: p.status === 'error' ? p.error ?? 'Turn failed' : null,
        ...(prev.status
          ? {
              status: {
                ...prev.status,
                currentTurnRunning: false,
                activeLogEntryId: null,
                lastTurnEndStatus: typeof p.status === 'string' ? p.status : prev.status.lastTurnEndStatus,
              },
              activeLogEntryId: null,
            }
          : {}),
      }))
      void s.refreshStatus(tabId)
      void s.refreshLog(tabId)
      void s.refreshHistory()
      break
    }

    case 'session.saved': {
      void s.refreshHistory()
      break
    }

    case 'server.crashed': {
      const p = (params ?? {}) as { error?: string }
      patchTabSnapshot(tabId, () => ({
        status: 'error',
        errorMessage: `Fermi server crashed: ${p.error ?? 'unknown error'}`,
      }))
      break
    }

    case 'server.stderr': {
      const text = (params as { text?: string })?.text ?? ''
      patchTabState(tabId, (prev) => ({ stderrLog: [...prev.stderrLog, text].slice(-100) }))
      break
    }

    case 'tab.closed': {
      const tabs = store().tabs.filter((t) => t.tabId !== tabId)
      const perTab = { ...store().perTab }
      delete perTab[tabId]
      let activeTabId = store().activeTabId
      if (activeTabId === tabId) activeTabId = tabs[0]?.tabId ?? null
      useSessionStore.setState({ tabs, perTab, activeTabId })
      storeActiveTabId(activeTabId)
      break
    }

    case 'tab.error': {
      const message = (params as { message?: string })?.message ?? 'unknown'
      patchTabSnapshot(tabId, () => ({ status: 'error', errorMessage: message }))
      patchTabState(tabId, (prev) => ({ stderrLog: [...prev.stderrLog, `[error] ${message}\n`].slice(-100) }))
      break
    }
  }
}

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
}

function currentModelForWorkspace(tabs: readonly SessionTab[], workDir: string): string | null {
  const workspaceTab = [...tabs].reverse().find((tab) => tab.workDir === workDir && tab.selectedModel)
  if (workspaceTab?.selectedModel) return workspaceTab.selectedModel
  const anyTab = [...tabs].reverse().find((tab) => tab.selectedModel)
  return anyTab?.selectedModel ?? null
}

function readStoredActiveTabId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY)
  } catch {
    return null
  }
}

function readStoredMarkdownMode(): 'rendered' | 'raw' {
  try {
    return localStorage.getItem(MARKDOWN_MODE_KEY) === 'raw' ? 'raw' : 'rendered'
  } catch {
    return 'rendered'
  }
}

function storeActiveTabId(tabId: string | null): void {
  try {
    if (tabId) localStorage.setItem(ACTIVE_TAB_KEY, tabId)
    else localStorage.removeItem(ACTIVE_TAB_KEY)
  } catch {
    // ignore
  }
}
