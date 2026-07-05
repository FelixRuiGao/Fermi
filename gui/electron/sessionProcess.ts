/**
 * One subprocess wrapping `fermi --server`. Handles NDJSON framing and
 * tracks pending requests.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { augmentedPath, resolveBun } from './paths.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface SessionProcessOptions {
  readonly workDir: string
  readonly sessionId?: string
  readonly selectedAgent?: string
  readonly selectedModel?: string
}

/** Subset of the server's `ready` meta the main process tracks per tab. */
export interface ReadyMeta {
  readonly sessionId: string
  readonly sessionDir: string | null
  readonly workDir: string
  readonly modelConfigName: string
  readonly modelProvider: string
  readonly modelDisplayLabel?: string
  readonly title?: string
  readonly displayName: string
  readonly capabilities?: readonly string[]
}

/** First lifecycle signal from the subprocess: session ready, or init needed. */
export type WaitReadyResult = { kind: 'ready'; meta: ReadyMeta } | { kind: 'needs_init' }

type Resolver = {
  resolve: (v: unknown) => void
  reject: (err: Error) => void
}

type Listeners = {
  event: Set<(method: string, params: unknown) => void>
  exit: Set<(code: number | null, signal: NodeJS.Signals | null) => void>
  stderr: Set<(text: string) => void>
  error: Set<(err: Error) => void>
}

export class SessionProcess {
  readonly #child: ChildProcessWithoutNullStreams
  readonly #pending = new Map<number, Resolver>()
  readonly #listeners: Listeners = { event: new Set(), exit: new Set(), stderr: new Set(), error: new Set() }
  #nextId = 1
  #stdoutBuffer = ''
  #ready = false
  #needsInit = false
  #readyMeta: ReadyMeta | null = null
  #closed = false
  #spawnError: Error | null = null

  constructor(options: SessionProcessOptions) {
    const bin = resolveFermiBinary()
    const args = ['--server', '--work-dir', options.workDir]
    if (options.sessionId) args.push('--session-id', options.sessionId)
    if (options.selectedAgent) args.push('--agent', options.selectedAgent)
    if (options.selectedModel) args.push('--model', options.selectedModel)

    this.#child = spawn(bin.cmd, [...bin.args, ...args], {
      cwd: options.workDir,
      env: {
        ...process.env,
        // A GUI-launched Electron doesn't inherit the login shell PATH, so
        // `bun` (and any tool it shells out to) must be findable here.
        PATH: augmentedPath(),
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.#child.stdout.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk: string) => this.#onStdout(chunk))
    this.#child.stderr.setEncoding('utf8')
    this.#child.stderr.on('data', (chunk: string) => {
      for (const cb of this.#listeners.stderr) cb(chunk)
    })
    this.#child.on('exit', (code, signal) => {
      this.#closed = true
      for (const p of this.#pending.values()) {
        p.reject(new Error(`fermi server exited (code=${code}, signal=${signal})`))
      }
      this.#pending.clear()
      for (const cb of this.#listeners.exit) cb(code, signal)
    })
    this.#child.on('error', (err) => {
      // Failure to even spawn (e.g. `bun` not on PATH). Without surfacing this,
      // waitReady would hang until its timeout with a misleading message.
      this.#closed = true
      this.#spawnError = err
      for (const cb of this.#listeners.stderr) cb(`[spawn error] ${err.message}\n`)
      for (const cb of this.#listeners.error) cb(err)
    })
  }

  get ready(): boolean { return this.#ready }
  get needsInit(): boolean { return this.#needsInit }
  get readyMeta(): ReadyMeta | null { return this.#readyMeta }
  get closed(): boolean { return this.#closed }

  async waitReady(timeoutMs = 30_000): Promise<WaitReadyResult> {
    if (this.#ready && this.#readyMeta) return { kind: 'ready', meta: this.#readyMeta }
    if (this.#needsInit) return { kind: 'needs_init' }
    if (this.#spawnError) throw this.#spawnError
    return new Promise<WaitReadyResult>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        this.#listeners.event.delete(eventHandler)
        this.#listeners.exit.delete(exitHandler)
        this.#listeners.error.delete(errorHandler)
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`session did not become ready in ${timeoutMs}ms`))
      }, timeoutMs)
      const eventHandler = (method: string, params: unknown): void => {
        if (method === 'ready') {
          cleanup()
          resolve({ kind: 'ready', meta: (this.#readyMeta ?? params) as ReadyMeta })
        } else if (method === 'needs_init') {
          cleanup()
          resolve({ kind: 'needs_init' })
        }
      }
      const exitHandler = (): void => {
        cleanup()
        reject(new Error('session exited before it became ready'))
      }
      const errorHandler = (err: Error): void => {
        cleanup()
        reject(err)
      }
      this.#listeners.event.add(eventHandler)
      this.#listeners.exit.add(exitHandler)
      this.#listeners.error.add(errorHandler)
    })
  }

  on(event: 'event', cb: (method: string, params: unknown) => void): () => void
  on(event: 'exit', cb: (code: number | null, signal: NodeJS.Signals | null) => void): () => void
  on(event: 'stderr', cb: (text: string) => void): () => void
  on(event: 'error', cb: (err: Error) => void): () => void
  on(event: keyof Listeners, cb: (...args: never[]) => void): () => void {
    const set = this.#listeners[event] as Set<(...args: never[]) => void>
    set.add(cb)
    return () => { set.delete(cb) }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('session closed'))
    const id = this.#nextId++
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      })
      const frame = JSON.stringify({ id, method, params: params ?? {} }) + '\n'
      this.#child.stdin.write(frame)
    })
  }

  async shutdown(): Promise<void> {
    if (this.#closed) return
    try {
      await Promise.race([
        this.request('server.shutdown'),
        new Promise<void>((_, rej) => setTimeout(() => rej(new Error('shutdown timeout')), 3_000)),
      ])
    } catch {
      // ignore — we're killing it anyway
    }
    if (!this.#closed) {
      this.#child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          this.#child.kill('SIGKILL')
          resolve()
        }, 2_000)
        this.#child.once('exit', () => {
          clearTimeout(t)
          resolve()
        })
      })
    }
  }

  #onStdout(chunk: string): void {
    this.#stdoutBuffer += chunk
    let nl = this.#stdoutBuffer.indexOf('\n')
    while (nl >= 0) {
      const line = this.#stdoutBuffer.slice(0, nl)
      this.#stdoutBuffer = this.#stdoutBuffer.slice(nl + 1)
      if (line.length > 0) this.#handleLine(line)
      nl = this.#stdoutBuffer.indexOf('\n')
    }
  }

  #handleLine(line: string): void {
    let frame: {
      id?: number
      method?: string
      params?: unknown
      result?: unknown
      error?: { code: number; message: string }
    }
    try {
      frame = JSON.parse(line)
    } catch {
      for (const cb of this.#listeners.stderr) cb(`[parse error] ${line}\n`)
      return
    }
    if (typeof frame.id === 'number') {
      const pending = this.#pending.get(frame.id)
      if (!pending) return
      this.#pending.delete(frame.id)
      if (frame.error) pending.reject(new Error(frame.error.message))
      else pending.resolve(frame.result)
      return
    }
    if (typeof frame.method === 'string') {
      if (frame.method === 'ready' && frame.params) {
        this.#readyMeta = frame.params as ReadyMeta
        this.#ready = true
        this.#needsInit = false
      } else if (frame.method === 'needs_init') {
        this.#needsInit = true
      }
      for (const cb of this.#listeners.event) cb(frame.method, frame.params)
    }
  }
}

function resolveFermiBinary(): { cmd: string; args: string[] } {
  // Dev: run the TS source directly with bun (hot iteration). Resolve bun to an
  // absolute path — a GUI Electron often can't find it on PATH.
  // Prod: point at the bundled binary in resourcesPath.
  const entry = path.resolve(__dirname, '../../../src/cli.ts')
  return { cmd: resolveBun() ?? 'bun', args: [entry] }
}
