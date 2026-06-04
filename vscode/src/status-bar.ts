// Status bar removed — model/token info is displayed in the webview's
// input-meta-row. This module is kept as an empty stub so imports don't break.

export class FermiStatusBar {
  updateModel(_name: string): void {}
  updateTokens(_inputTokens: number, _contextBudget: number): void {}
  updateProcessing(_running: boolean): void {}
  hide(): void {}
  dispose(): void {}
}
