import * as vscode from "vscode";
import type { SessionManager } from "./session-manager.js";
import { getWebviewHtml, handleWebviewMessage } from "./webview-bridge.js";
import type { ExtToWebviewMessage, WebviewToExtMessage } from "./types.js";

export class FermiSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "fermi.chatView";

  private view?: vscode.WebviewView;
  private extensionUri: vscode.Uri;
  private sessionManager: SessionManager;
  private eventDispose?: () => void;

  constructor(extensionUri: vscode.Uri, sessionManager: SessionManager) {
    this.extensionUri = extensionUri;
    this.sessionManager = sessionManager;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "out")],
    };
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);

    view.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
      handleWebviewMessage(msg, this.sessionManager, (m) => this.post(m));
    });

    this.eventDispose?.();
    this.eventDispose = this.sessionManager.onEvent((method, params) => {
      this.post({ type: "event", method, params });
    });

    view.onDidDispose(() => {
      this.eventDispose?.();
      this.eventDispose = undefined;
    });

    this.sessionManager.start();
  }

  // ── Commands (invoked from extension.ts) ──

  newSession(): void { void this.sessionManager.newSession(); }
  interruptTurn(): void { void this.sessionManager.request("session.requestTurnInterrupt").catch(() => {}); }
  selectModel(): void { void this.sessionManager.selectModel(); }

  async switchSession(): Promise<void> {
    try {
      const sessions = await this.sessionManager.request<any[]>("session.listProjectSessions");
      if (!sessions || sessions.length === 0) {
        vscode.window.showInformationMessage("No saved sessions in this workspace.");
        return;
      }
      const items = sessions.map((s: any) => ({
        label: s.title || s.summary || s.sessionId,
        description: s.lastActiveAt ?? "",
        sessionId: s.sessionId,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: "Switch to session" });
      if (picked) await this.sessionManager.request("session.restoreSession", { sessionId: (picked as any).sessionId });
    } catch {}
  }

  addFileToChat(filePath: string, selection?: string): void {
    this.post({ type: "file-context", filePath, selection });
  }

  private post(msg: ExtToWebviewMessage): void {
    this.view?.webview.postMessage(msg);
  }
}
