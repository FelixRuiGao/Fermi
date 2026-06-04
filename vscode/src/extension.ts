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

  // ── Chat Participant (Codex-style: session list in Copilot panel) ──
  try {
    const participant = vscode.chat.createChatParticipant("fermi", async (request, _context, stream, _token) => {
      // When user sends a message through the Copilot panel, open our
      // webview sidebar and forward the message there instead.
      await vscode.commands.executeCommand("fermi.chatView.focus");
      if (request.prompt) {
        sidebarProvider.addFileToChat("", request.prompt);
      }
      stream.markdown("*Opened in Fermi sidebar panel.*");
    });
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "fermi-icon.svg");
    context.subscriptions.push(participant);
  } catch {
    // Chat API may not be available in older VSCode versions
  }

  // ── Commands ──

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
