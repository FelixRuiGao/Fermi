/**
 * Shared webview wiring used by both the sidebar view and the session
 * editor tab. Handles HTML generation and the webview↔backend message
 * protocol (RPC forwarding, __ext.* commands, diff bridge).
 */

import * as vscode from "vscode";
import { showDiff } from "./diff-bridge.js";
import type { ExtToWebviewMessage, WebviewToExtMessage } from "./types.js";

export interface WebviewBackend {
  request(method: string, params?: unknown): Promise<unknown>;
  newSession(): void | Promise<void>;
  selectModel(): void | Promise<void>;
  /** Returns the cached initial event to re-push on webview reconnect. */
  getInitialState(): { method: string; params: unknown } | null;
  /** Open a historical session in a tab (sidebar only; undefined in tabs). */
  openSession?(sessionId: string, title?: string): void;
  /** Trigger the one-click Fermi installer. */
  installFermi?(): void | Promise<void>;
}

export function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "out", "webview.js"));
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

/**
 * Handle a single message from the webview. Returns true if handled.
 * Posts responses/events back through `post`.
 */
export async function handleWebviewMessage(
  msg: WebviewToExtMessage,
  backend: WebviewBackend,
  post: (msg: ExtToWebviewMessage) => void,
): Promise<void> {
  if (msg.type === "ready") {
    const initial = backend.getInitialState();
    if (initial) {
      post({ type: "event", method: initial.method, params: initial.params });
    }
    return;
  }

  if (msg.type !== "rpc") return;

  const respond = (result: unknown) => post({ type: "rpc-response", id: msg.id, result });
  const respondError = (error: string) => post({ type: "rpc-response", id: msg.id, error });

  // Extension-handled commands
  if (msg.method === "__ext.newSession") {
    await backend.newSession();
    respond({ ok: true });
    return;
  }
  if (msg.method === "__ext.selectModel") {
    await backend.selectModel();
    respond({ ok: true });
    return;
  }
  if (msg.method === "__ext.openSession") {
    const p = msg.params as { sessionId: string; title?: string };
    backend.openSession?.(p.sessionId, p.title);
    respond({ ok: true });
    return;
  }
  if (msg.method === "__ext.installFermi") {
    await backend.installFermi?.();
    respond({ ok: true });
    return;
  }
  if (msg.method === "__ext.addFile") {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      post({ type: "file-context", filePath: vscode.workspace.asRelativePath(editor.document.uri) });
    } else {
      const uris = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: "Add to Chat" });
      if (uris) {
        for (const uri of uris) {
          post({ type: "file-context", filePath: vscode.workspace.asRelativePath(uri) });
        }
      }
    }
    respond({ ok: true });
    return;
  }
  if (msg.method === "vscode.showDiff") {
    const p = msg.params as any;
    try {
      await showDiff(p.filePath, p.before, p.after);
      respond({ ok: true });
    } catch (err: any) {
      respondError(err.message);
    }
    return;
  }

  // Forward to fermi server
  try {
    const result = await backend.request(msg.method, msg.params);
    respond(result);
  } catch (err: any) {
    respondError(err.message);
  }
}
