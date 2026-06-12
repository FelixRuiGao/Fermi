/**
 * Shared fermi --server process manager.
 * Both the webview sidebar and the Chat Participant use the same process.
 */

import * as vscode from "vscode";
import { FermiProcess } from "./fermi-process.js";
import { resolveFermiBinary } from "./binary-resolver.js";
import { installFermi } from "./installer.js";
import { openSessionTab } from "./session-tab.js";
import type { SessionMeta, SessionStatus, LogEntry } from "./types.js";

type EventHandler = (method: string, params: unknown) => void;

export class SessionManager {
  private process?: FermiProcess;
  private outputChannel: vscode.OutputChannel;
  private extensionUri: vscode.Uri;
  private eventHandlers = new Set<EventHandler>();
  private _cachedMeta: SessionMeta | null = null;
  private _needsInit = false;
  private _binaryNotFound = false;

  constructor(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
    this.extensionUri = extensionUri;
    this.outputChannel = outputChannel;
  }

  get isAlive(): boolean {
    return this.process?.isAlive ?? false;
  }

  get cachedMeta(): SessionMeta | null {
    return this._cachedMeta;
  }

  get needsInit(): boolean {
    return this._needsInit;
  }

  get binaryNotFound(): boolean {
    return this._binaryNotFound;
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(method: string, params: unknown): void {
    for (const handler of this.eventHandlers) {
      handler(method, params);
    }
  }

  start(): void {
    if (this.process?.isAlive) return;

    const workDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workDir) {
      this.emit("error", { message: "No workspace folder open." });
      return;
    }

    const resolved = resolveFermiBinary();
    if (resolved.source === "not-found") {
      this._binaryNotFound = true;
      this.emit("binary_not_found", {});
      return;
    }

    this.process = new FermiProcess(resolved.path, workDir);

    this.process.on("server-event", (method: string, params: unknown) => {
      if (method === "ready") {
        this._cachedMeta = params as SessionMeta;
        this._needsInit = false;
        vscode.commands.executeCommand("setContext", "fermi.isConnected", true);
      }
      if (method === "needs_init") {
        this._needsInit = true;
        this._cachedMeta = null;
        vscode.commands.executeCommand("setContext", "fermi.needsInit", true);
      }
      if (method === "log.changed") {
        const p = params as any;
        if (p?.status) {
          vscode.commands.executeCommand("setContext", "fermi.isRunning", p.status.currentTurnRunning);
        }
      }
      if (method === "turn.ended") {
        vscode.commands.executeCommand("setContext", "fermi.isRunning", false);
      }
      if (method === "model.changed") {
        if (this._cachedMeta) {
          this._cachedMeta = { ...this._cachedMeta, modelConfigName: (params as any)?.name };
        }
      }
      this.emit(method, params);
    });

    this.process.on("stderr", (text: string) => {
      this.outputChannel.append(text);
    });

    this.process.on("exit", (code: number | null) => {
      this.outputChannel.appendLine(`fermi server exited with code ${code}`);
      vscode.commands.executeCommand("setContext", "fermi.isConnected", false);
      vscode.commands.executeCommand("setContext", "fermi.isRunning", false);
      // Tell the webview. Without this the UI silently froze at its last
      // rendered state; a server.crashed event (if the server got one out)
      // has already set a more specific message and wins in the store.
      this.emit("server.exited", { code });
    });
  }

  async restart(): Promise<void> {
    const prevMeta = this._cachedMeta;
    this.kill();
    this.emit("session.starting", { modelConfigName: prevMeta?.modelConfigName });
    this.start();
  }

  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.process?.isAlive) throw new Error("fermi process not running");
    return this.process.request<T>(method, params);
  }

  // ── WebviewBackend interface ──

  async newSession(): Promise<void> {
    await this.restart();
  }

  async selectModel(): Promise<void> {
    try {
      const models = await this.request<any[]>("session.listAvailableModels");
      const items = models.map((m: any) => ({
        label: m.name,
        description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: "Select model" });
      if (picked) await this.request("session.selectModel", { name: picked.label });
    } catch {}
  }

  getInitialState(): { method: string; params: unknown } | null {
    if (this._cachedMeta) return { method: "ready", params: this._cachedMeta };
    if (this._needsInit) return { method: "needs_init", params: {} };
    if (this._binaryNotFound) return { method: "binary_not_found", params: {} };
    return null;
  }

  openSession(sessionId: string, title?: string): void {
    openSessionTab(this.extensionUri, this.outputChannel, sessionId, title);
  }

  async installFermi(): Promise<void> {
    const ok = await installFermi();
    if (ok) {
      this._binaryNotFound = false;
      this.start();
    }
  }
}
