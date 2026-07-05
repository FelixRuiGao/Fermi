/**
 * Main-process registry of GUI tabs. One tab ↔ one fermi subprocess.
 *
 * Forwards subprocess events to the renderer via `webContents.send('rpc:event',
 * { tabId, method, params })`. Renderer issues `rpc:request` calls back via
 * the preload bridge.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import type { WebContents } from 'electron'
import { SessionProcess, type SessionProcessOptions, type ReadyMeta } from './sessionProcess.js'
import type { SessionTab } from '../shared/rpc.js'

interface TabRecord {
  readonly tabId: string
  readonly process: SessionProcess | null
  readonly workDir: string
  sessionId: string | null
  title: string | null
  displayName: string | null
  selectedModel: string | null
  modelProvider: string | null
  status: 'starting' | 'ready' | 'error' | 'closed'
  needsInit: boolean
  errorMessage?: string
  readonly createdAt: number
  lastActiveAt: number
}

function snapshot(r: TabRecord): SessionTab {
  return {
    tabId: r.tabId,
    workDir: r.workDir,
    sessionId: r.sessionId,
    title: r.title,
    displayName: r.displayName,
    selectedModel: r.selectedModel,
    modelProvider: r.modelProvider,
    createdAt: r.createdAt,
    lastActiveAt: r.lastActiveAt,
    status: r.status,
    needsInit: r.needsInit,
    errorMessage: r.errorMessage,
  }
}

export class SessionManager {
  readonly #tabs = new Map<string, TabRecord>()
  #webContents: WebContents | null = null

  bindWebContents(webContents: WebContents): void {
    this.#webContents = webContents
  }

  listTabs(): readonly SessionTab[] {
    return [...this.#tabs.values()].map(snapshot)
  }

  async createTab(options: SessionProcessOptions): Promise<SessionTab> {
    const tabId = randomUUID()

    if (!existsSync(options.workDir) || !statSync(options.workDir).isDirectory()) {
      const record: TabRecord = {
        tabId,
        process: null,
        workDir: options.workDir,
        sessionId: null,
        title: null,
        displayName: null,
        selectedModel: options.selectedModel ?? null,
        modelProvider: null,
        status: 'error',
        needsInit: false,
        errorMessage: `Workspace folder no longer exists:\n${options.workDir}`,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      }
      this.#tabs.set(tabId, record)
      this.#emit(tabId, 'tab.error', { message: record.errorMessage })
      return snapshot(record)
    }

    const proc = new SessionProcess(options)
    const record: TabRecord = {
      tabId,
      process: proc,
      workDir: options.workDir,
      sessionId: null,
      title: null,
      displayName: null,
      selectedModel: options.selectedModel ?? null,
      modelProvider: null,
      status: 'starting',
      needsInit: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }
    this.#tabs.set(tabId, record)

    proc.on('event', (method, params) => {
      if (method === 'ready' || method === 'turn.started' || method === 'log.changed') {
        record.lastActiveAt = Date.now()
      }
      if (method === 'ready') {
        const meta = params as ReadyMeta | null
        if (meta) {
          record.sessionId = meta.sessionId
          record.selectedModel = meta.modelConfigName
          record.modelProvider = meta.modelProvider
          record.title = meta.title ?? null
          record.displayName = meta.displayName ?? null
          record.status = 'ready'
          record.needsInit = false
        }
      }
      if (method === 'needs_init') {
        // Subprocess is alive but has no providers — it's driving the init
        // wizard, not failing. Keep the tab "ready" so the renderer can show it.
        record.status = 'ready'
        record.needsInit = true
      }
      this.#emit(tabId, method, params)
    })

    proc.on('exit', (code, signal) => {
      record.status = 'closed'
      this.#emit(tabId, 'tab.closed', { code, signal })
      this.#tabs.delete(tabId)
    })

    proc.on('stderr', (text) => {
      this.#emit(tabId, 'server.stderr', { text })
    })

    try {
      const result = await proc.waitReady()
      if (result.kind === 'needs_init') {
        record.status = 'ready'
        record.needsInit = true
      }
    } catch (err) {
      record.status = 'error'
      record.errorMessage = err instanceof Error ? err.message : String(err)
      this.#emit(tabId, 'tab.error', { message: record.errorMessage })
    }
    return snapshot(record)
  }

  async closeTab(tabId: string): Promise<void> {
    const r = this.#tabs.get(tabId)
    if (!r) return
    await r.process?.shutdown()
    this.#tabs.delete(tabId)
  }

  async closeAll(): Promise<void> {
    const all = [...this.#tabs.values()]
    this.#tabs.clear()
    await Promise.allSettled(all.map((r) => r.process?.shutdown() ?? Promise.resolve()))
  }

  async request(tabId: string, method: string, params?: unknown): Promise<unknown> {
    const r = this.#tabs.get(tabId)
    if (!r) throw new Error(`unknown tab: ${tabId}`)
    if (!r.process) throw new Error(r.errorMessage ?? 'session is not running')
    return r.process.request(method, params)
  }

  #emit(tabId: string, method: string, params: unknown): void {
    const wc = this.#webContents
    if (!wc || wc.isDestroyed()) return
    try {
      wc.send('rpc:event', { tabId, method, params })
    } catch {
      // ignore
    }
  }
}
