/**
 * Opens a Fermi session in an editor-area tab, hosting the same React
 * webview as the sidebar. Each tab spawns its own fermi --server and
 * restores the clicked session into it. Uses only stable VS Code APIs.
 */

import * as vscode from "vscode";
import { FermiProcess } from "./fermi-process.js";
import { resolveFermiBinary } from "./binary-resolver.js";
import { getWebviewHtml, handleWebviewMessage, type WebviewBackend } from "./webview-bridge.js";
import type { ExtToWebviewMessage, WebviewToExtMessage, SessionMeta } from "./types.js";

class SessionEditorBackend implements WebviewBackend {
  private process?: FermiProcess;
  private cachedMeta: SessionMeta | null = null;
  private needsInit = false;
  private binaryNotFound = false;
  private restored = false;
  private intentionalKill = false;
  private handlers = new Set<(method: string, params: unknown) => void>();

  constructor(
    private readonly sessionId: string,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  onEvent(handler: (method: string, params: unknown) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(method: string, params: unknown): void {
    for (const h of this.handlers) h(method, params);
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
      this.binaryNotFound = true;
      this.emit("binary_not_found", {});
      return;
    }

    this.process = new FermiProcess(resolved.path, workDir);

    this.process.on("server-event", async (method: string, params: unknown) => {
      if (method === "ready") {
        // First ready: restore the requested session, then forward subsequent state.
        if (!this.restored) {
          this.restored = true;
          try {
            await this.process!.request("session.restoreSession", { sessionId: this.sessionId });
          } catch (err: any) {
            this.outputChannel.appendLine(`restore failed: ${err?.message}`);
          }
          return;
        }
        this.cachedMeta = params as SessionMeta;
      }
      if (method === "needs_init") {
        this.needsInit = true;
      }
      this.emit(method, params);
    });

    this.process.on("stderr", (text: string) => this.outputChannel.append(text));
    this.process.on("exit", () => {
      // Suppress error during an intentional restart (kill + start).
      if (this.intentionalKill) {
        this.intentionalKill = false;
        return;
      }
      this.emit("error", { message: "Fermi server exited." });
    });
  }

  kill(): void {
    if (this.process) {
      this.intentionalKill = true;
      this.process.kill();
      this.process = undefined;
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.process?.isAlive) throw new Error("fermi process not running");
    return this.process.request(method, params);
  }

  async newSession(): Promise<void> {
    // In a session tab, "new session" restarts with a fresh session.
    const prevModel = this.cachedMeta?.modelConfigName;
    this.restored = true;
    this.cachedMeta = null;
    this.kill();
    this.emit("session.starting", { modelConfigName: prevModel });
    this.start();
  }

  async selectModel(): Promise<void> {
    try {
      const models = await this.request("session.listAvailableModels") as any[];
      const items = models.map((m: any) => ({
        label: m.name,
        description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: "Select model" });
      if (picked) await this.request("session.selectModel", { name: picked.label });
    } catch {}
  }

  getInitialState(): { method: string; params: unknown } | null {
    if (this.cachedMeta) return { method: "ready", params: this.cachedMeta };
    if (this.needsInit) return { method: "needs_init", params: {} };
    if (this.binaryNotFound) return { method: "binary_not_found", params: {} };
    return null;
  }
}

// Track open session tabs so re-opening the same session focuses the
// existing tab instead of spawning a duplicate.
const openTabs = new Map<string, vscode.WebviewPanel>();

/**
 * Open a historical session in an editor-area tab hosting our webview.
 * Uses only stable APIs (createWebviewPanel), so it works on the
 * Marketplace without proposed APIs.
 */
export function openSessionTab(
  extensionUri: vscode.Uri,
  outputChannel: vscode.OutputChannel,
  sessionId: string,
  title?: string,
): void {
  const existing = openTabs.get(sessionId);
  if (existing) {
    existing.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "fermi.sessionTab",
    title || "Fermi Session",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, "resources", "fermi-icon.svg");
  openTabs.set(sessionId, panel);

  const backend = new SessionEditorBackend(sessionId, outputChannel);
  panel.webview.html = getWebviewHtml(panel.webview, extensionUri);

  const post = (m: ExtToWebviewMessage) => panel.webview.postMessage(m);

  panel.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
    handleWebviewMessage(msg, backend, post);
  });

  const dispose = backend.onEvent((method, params) => {
    if (method === "ready") {
      const meta = params as SessionMeta;
      const t = meta?.title || meta?.displayName;
      if (t) panel.title = t;
    }
    post({ type: "event", method, params });
  });

  panel.onDidDispose(() => {
    dispose();
    backend.kill();
    openTabs.delete(sessionId);
  });

  backend.start();
}
