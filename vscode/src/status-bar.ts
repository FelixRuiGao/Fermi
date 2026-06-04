import * as vscode from "vscode";

export class FermiStatusBar {
  private modelItem: vscode.StatusBarItem;
  private tokenItem: vscode.StatusBarItem;

  constructor() {
    this.modelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.modelItem.command = "fermi.selectModel";
    this.modelItem.tooltip = "Fermi: Click to change model";

    this.tokenItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.tokenItem.tooltip = "Fermi: Token usage";
  }

  updateModel(name: string): void {
    const shortName = name.includes(":") ? name.split(":")[1] : name;
    this.modelItem.text = `$(hubot) ${shortName}`;
    this.modelItem.show();
  }

  updateTokens(inputTokens: number, contextBudget: number): void {
    if (inputTokens <= 0) {
      this.tokenItem.hide();
      return;
    }
    const pct = contextBudget > 0 ? Math.round((inputTokens / contextBudget) * 100) : 0;
    const kTokens = (inputTokens / 1000).toFixed(1);
    this.tokenItem.text = `${kTokens}k tokens (${pct}%)`;
    this.tokenItem.show();
  }

  updateProcessing(running: boolean): void {
    if (running) {
      this.modelItem.text = `$(loading~spin) ${this.modelItem.text?.replace("$(loading~spin) ", "").replace("$(hubot) ", "")}`;
    }
  }

  hide(): void {
    this.modelItem.hide();
    this.tokenItem.hide();
  }

  dispose(): void {
    this.modelItem.dispose();
    this.tokenItem.dispose();
  }
}
