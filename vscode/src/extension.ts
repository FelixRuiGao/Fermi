import * as vscode from "vscode";
import { FermiSidebarProvider } from "./sidebar-provider.js";
import { FermiStatusBar } from "./status-bar.js";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Fermi");
  const statusBar = new FermiStatusBar();
  const sidebarProvider = new FermiSidebarProvider(
    context.extensionUri,
    statusBar,
    outputChannel,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      FermiSidebarProvider.viewType,
      sidebarProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fermi.newSession", () => {
      sidebarProvider.newSession();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fermi.interruptTurn", () => {
      sidebarProvider.interruptTurn();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fermi.selectModel", () => {
      sidebarProvider.selectModel();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fermi.switchSession", () => {
      sidebarProvider.switchSession();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fermi.addFileToChat", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
      sidebarProvider.addFileToChat(relativePath);
    }),
  );

  context.subscriptions.push(
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

  context.subscriptions.push(statusBar);
  context.subscriptions.push(outputChannel);
}

export function deactivate() {}
