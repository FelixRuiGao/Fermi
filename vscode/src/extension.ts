import * as vscode from "vscode";
import { SessionManager } from "./session-manager.js";
import { FermiSidebarProvider } from "./sidebar-provider.js";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Fermi");
  const sessionManager = new SessionManager(context.extensionUri, outputChannel);
  const sidebarProvider = new FermiSidebarProvider(context.extensionUri, sessionManager);

  vscode.commands.executeCommand("setContext", "fermi.doesNotSupportSecondarySidebar", false);

  // Webview views (primary + secondary sidebar)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FermiSidebarProvider.viewType, sidebarProvider),
    vscode.window.registerWebviewViewProvider("fermi.secondaryView", sidebarProvider),
  );

  // ── Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand("fermi.newSession", () => sidebarProvider.newSession()),
    vscode.commands.registerCommand("fermi.interruptTurn", () => sidebarProvider.interruptTurn()),
    vscode.commands.registerCommand("fermi.selectModel", () => sidebarProvider.selectModel()),
    vscode.commands.registerCommand("fermi.switchSession", () => sidebarProvider.switchSession()),

    vscode.commands.registerCommand("fermi.addFileToChat", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      sidebarProvider.addFileToChat(vscode.workspace.asRelativePath(editor.document.uri));
    }),

    vscode.commands.registerCommand("fermi.addSelectionToChat", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
      const selection = editor.selection;
      if (selection.isEmpty) return;
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      const lineRef = startLine === endLine ? `#L${startLine}` : `#L${startLine}-${endLine}`;
      sidebarProvider.addFileToChat(`${relativePath}${lineRef}`, editor.document.getText(selection));
    }),
  );

  context.subscriptions.push(outputChannel);
  context.subscriptions.push({ dispose: () => sessionManager.kill() });
}

export function deactivate() {}
