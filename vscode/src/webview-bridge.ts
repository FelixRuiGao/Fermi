/**
 * Shared webview wiring used by both the sidebar view and the session
 * editor tab. Handles HTML generation and the webview↔backend message
 * protocol (RPC forwarding, __ext.* commands, diff bridge).
 */

import * as vscode from "vscode";
import { spawnSync } from "child_process";
import { basename } from "path";
import { showDiff } from "./diff-bridge.js";
import { readGitBranch } from "./git-info.js";
import type { ExtToWebviewMessage, WebviewToExtMessage } from "./types.js";

function workspaceDir(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? (result.stdout ?? "") : "";
}

/** Other branches to review against, deduped like the TUI's /review picker. */
function gitBranchList(cwd: string): string[] {
  const current = git(["branch", "--show-current"], cwd).trim();
  const branches = git(["branch", "-a", "--format=%(refname:short)"], cwd)
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .filter((b) => b !== current && !b.endsWith("/HEAD"));
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const b of branches) {
    const short = b.replace(/^origin\//, "");
    if (!seen.has(short)) {
      seen.add(short);
      deduped.push(b);
    }
  }
  return deduped;
}

function gitCommitList(cwd: string): Array<{ sha: string; subject: string }> {
  return git(["log", "--oneline", "-20"], cwd)
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(" ");
      return spaceIdx > 0
        ? { sha: line.slice(0, spaceIdx), subject: line.slice(spaceIdx + 1) }
        : { sha: line, subject: "" };
    });
}

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
  if (msg.method === "__ext.searchFiles") {
    const p = msg.params as { query?: string };
    const q = (p?.query ?? "").replace(/[{}[\]]/g, "");
    try {
      const uris = await vscode.workspace.findFiles(
        q ? `**/*${q}*` : "**/*",
        "**/{node_modules,.git,dist,out,build}/**",
        20,
      );
      respond(uris.map((u) => vscode.workspace.asRelativePath(u)).sort((a, b) => a.length - b.length));
    } catch {
      respond([]);
    }
    return;
  }
  if (msg.method === "__ext.gitBranches") {
    const dir = workspaceDir();
    respond(dir ? gitBranchList(dir) : []);
    return;
  }
  if (msg.method === "__ext.gitLog") {
    const dir = workspaceDir();
    respond(dir ? gitCommitList(dir) : []);
    return;
  }
  if (msg.method === "__ext.getContext") {
    const folder = vscode.workspace.workspaceFolders?.[0];
    respond({
      workspaceName: folder ? basename(folder.uri.fsPath) : null,
      branch: folder ? readGitBranch(folder.uri.fsPath) : null,
    });
    return;
  }
  if (msg.method === "__ext.openFile") {
    const p = msg.params as { path: string; line?: number };
    try {
      const folder = vscode.workspace.workspaceFolders?.[0];
      const isAbsolute = p.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p.path);
      const uri = isAbsolute
        ? vscode.Uri.file(p.path)
        : folder
          ? vscode.Uri.joinPath(folder.uri, p.path)
          : vscode.Uri.file(p.path);
      const options: vscode.TextDocumentShowOptions = { preview: true };
      if (typeof p.line === "number" && p.line > 0) {
        const pos = new vscode.Position(p.line - 1, 0);
        options.selection = new vscode.Range(pos, pos);
      }
      await vscode.window.showTextDocument(uri, options);
      respond({ ok: true });
    } catch (err: any) {
      respondError(err.message);
    }
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
