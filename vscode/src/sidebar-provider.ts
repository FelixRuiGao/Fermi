import * as vscode from "vscode";
import { FermiProcess } from "./fermi-process.js";
import { resolveFermiBinary } from "./binary-resolver.js";
import { FermiStatusBar } from "./status-bar.js";
import { showDiff } from "./diff-bridge.js";
import type { ExtToWebviewMessage, WebviewToExtMessage } from "./types.js";

export class FermiSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "fermi.chatView";

  private view?: vscode.WebviewView;
  private process?: FermiProcess;
  private statusBar: FermiStatusBar;
  private extensionUri: vscode.Uri;
  private outputChannel: vscode.OutputChannel;
  private cachedServerState: { event: string; params: unknown } | null = null;
  private needsInit = false;

  constructor(
    extensionUri: vscode.Uri,
    statusBar: FermiStatusBar,
    outputChannel: vscode.OutputChannel,
  ) {
    this.extensionUri = extensionUri;
    this.statusBar = statusBar;
    this.outputChannel = outputChannel;
  }

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "out")],
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
      this.handleWebviewMessage(msg);
    });

    view.onDidDispose(() => {
      this.killProcess();
    });

    this.startProcess();
  }

  // ── Commands ──

  async newSession(): Promise<void> {
    this.killProcess();
    this.startProcess();
    this.postEvent("session.reset", {});
  }

  async interruptTurn(): Promise<void> {
    if (!this.process?.isAlive) return;
    try {
      await this.process.request("session.requestTurnInterrupt");
    } catch {}
  }

  async selectModel(): Promise<void> {
    if (!this.process?.isAlive) return;
    try {
      const models = await this.process.request<any[]>("session.listAvailableModels");
      const items = models.map((m: any) => ({
        label: m.name,
        description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select model",
      });
      if (picked) {
        await this.process.request("session.selectModel", { name: picked.label });
      }
    } catch (err) {
      this.outputChannel.appendLine(`selectModel error: ${err}`);
    }
  }

  async switchSession(): Promise<void> {
    if (!this.process?.isAlive) return;
    try {
      const sessions = await this.process.request<any[]>("session.listProjectSessions");
      if (!sessions || sessions.length === 0) {
        vscode.window.showInformationMessage("No saved sessions in this workspace.");
        return;
      }
      const items = sessions.map((s: any) => ({
        label: s.title || s.sessionId,
        description: s.lastActive ?? "",
        sessionId: s.sessionId,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Switch to session",
      });
      if (picked) {
        await this.process.request("session.restoreSession", {
          sessionId: (picked as any).sessionId,
        });
      }
    } catch (err) {
      this.outputChannel.appendLine(`switchSession error: ${err}`);
    }
  }

  addFileToChat(filePath: string, selection?: string): void {
    this.postToWebview({
      type: "file-context",
      filePath,
      selection,
    });
  }

  // ── Process management ──

  private startProcess(): void {
    const workDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workDir) {
      this.postEvent("error", { message: "No workspace folder open." });
      return;
    }

    const resolved = resolveFermiBinary();
    if (resolved.source === "not-found") {
      this.postEvent("binary_not_found", {});
      return;
    }

    this.process = new FermiProcess(resolved.path, workDir);

    this.process.on("server-event", (method: string, params: unknown) => {
      this.postEvent(method, params);

      if (method === "ready") {
        const meta = params as any;
        if (meta?.modelConfigName) this.statusBar.updateModel(meta.modelConfigName);
        vscode.commands.executeCommand("setContext", "fermi.isConnected", true);
        this.cachedServerState = { event: "ready", params };
        this.needsInit = false;
      }

      if (method === "needs_init") {
        vscode.commands.executeCommand("setContext", "fermi.needsInit", true);
        this.needsInit = true;
        this.cachedServerState = null;
      }

      if (method === "log.changed") {
        const p = params as any;
        if (p?.status) {
          const s = p.status;
          vscode.commands.executeCommand("setContext", "fermi.isRunning", s.currentTurnRunning);
          this.statusBar.updateTokens(s.lastInputTokens ?? 0, s.contextBudget ?? 0);
          if (s.currentTurnRunning) this.statusBar.updateProcessing(true);
        }
      }

      if (method === "turn.ended") {
        vscode.commands.executeCommand("setContext", "fermi.isRunning", false);
      }

      if (method === "model.changed") {
        const p = params as any;
        if (p?.name) this.statusBar.updateModel(p.name);
      }
    });

    this.process.on("stderr", (text: string) => {
      this.outputChannel.append(text);
    });

    this.process.on("exit", (code: number | null) => {
      this.outputChannel.appendLine(`fermi server exited with code ${code}`);
      vscode.commands.executeCommand("setContext", "fermi.isConnected", false);
      vscode.commands.executeCommand("setContext", "fermi.isRunning", false);
      this.statusBar.hide();
    });
  }

  private killProcess(): void {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    this.statusBar.hide();
  }

  // ── Webview message handling ──

  private async handleWebviewMessage(msg: WebviewToExtMessage): Promise<void> {
    if (msg.type === "ready") {
      if (this.cachedServerState) {
        this.postEvent(this.cachedServerState.event, this.cachedServerState.params);
      } else if (this.needsInit) {
        this.postEvent("needs_init", {});
      }
      return;
    }

    if (msg.type === "rpc") {
      // Special client-side commands
      if (msg.method === "__ext.newSession") {
        this.newSession();
        this.postToWebview({ type: "rpc-response", id: msg.id, result: { ok: true } });
        return;
      }

      if (msg.method === "__ext.selectModel") {
        this.selectModel();
        this.postToWebview({ type: "rpc-response", id: msg.id, result: { ok: true } });
        return;
      }

      if (msg.method === "__ext.addFile") {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
          this.addFileToChat(relativePath);
        }
        this.postToWebview({ type: "rpc-response", id: msg.id, result: { ok: true } });
        return;
      }

      if (msg.method === "vscode.showDiff") {
        const p = msg.params as any;
        try {
          await showDiff(p.filePath, p.before, p.after);
          this.postToWebview({ type: "rpc-response", id: msg.id, result: { ok: true } });
        } catch (err: any) {
          this.postToWebview({ type: "rpc-response", id: msg.id, error: err.message });
        }
        return;
      }

      if (!this.process?.isAlive) {
        this.postToWebview({
          type: "rpc-response",
          id: msg.id,
          error: "fermi process not running",
        });
        return;
      }

      try {
        const result = await this.process.request(msg.method, msg.params);
        this.postToWebview({ type: "rpc-response", id: msg.id, result });
      } catch (err: any) {
        this.postToWebview({ type: "rpc-response", id: msg.id, error: err.message });
      }
    }
  }

  private postEvent(method: string, params: unknown): void {
    this.postToWebview({ type: "event", method, params });
  }

  private postToWebview(msg: ExtToWebviewMessage): void {
    this.view?.webview.postMessage(msg);
  }

  // ── HTML ──

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview.js"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Fermi</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
