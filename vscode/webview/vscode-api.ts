import type { ExtToWebviewMessage, WebviewToExtMessage } from "../src/types.js";

type VsCodeApi = {
  postMessage(msg: WebviewToExtMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

type PendingRpc = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

const pendingRpcs = new Map<number, PendingRpc>();
let nextRpcId = 1;

const eventListeners = new Map<string, Set<(params: unknown) => void>>();

window.addEventListener("message", (event) => {
  const msg = event.data as ExtToWebviewMessage;

  if (msg.type === "rpc-response") {
    const pending = pendingRpcs.get(msg.id);
    if (pending) {
      pendingRpcs.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    }
    return;
  }

  if (msg.type === "event") {
    const listeners = eventListeners.get(msg.method);
    if (listeners) {
      for (const listener of listeners) {
        listener(msg.params);
      }
    }
    const allListeners = eventListeners.get("*");
    if (allListeners) {
      for (const listener of allListeners) {
        listener({ method: msg.method, params: msg.params });
      }
    }
    return;
  }

  if (msg.type === "file-context") {
    const listeners = eventListeners.get("__file-context");
    if (listeners) {
      for (const listener of listeners) {
        listener(msg);
      }
    }
  }
});

export function rpcRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
  const id = nextRpcId++;
  return new Promise<T>((resolve, reject) => {
    pendingRpcs.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    vscode.postMessage({ type: "rpc", id, method, params });
  });
}

export function onEvent(method: string, handler: (params: unknown) => void): () => void {
  let listeners = eventListeners.get(method);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(method, listeners);
  }
  listeners.add(handler);
  return () => {
    listeners!.delete(handler);
  };
}

export function notifyReady(): void {
  vscode.postMessage({ type: "ready" });
}
