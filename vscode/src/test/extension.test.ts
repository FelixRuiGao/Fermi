import * as assert from "assert";
import * as vscode from "vscode";
import { getWebviewHtml, handleWebviewMessage, type WebviewBackend } from "../webview-bridge.js";
import { resolveFermiBinary, fermiInstallDir } from "../binary-resolver.js";
import type { ExtToWebviewMessage, WebviewToExtMessage } from "../types.js";

// Runs inside a real VS Code extension host via @vscode/test-cli.

suite("extension activation", () => {
  test("extension is present and activates", async () => {
    const ext = vscode.extensions.getExtension("fermi.fermi-code");
    assert.ok(ext, "fermi.fermi-code not found");
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test("all contributed commands are registered", async () => {
    const ext = vscode.extensions.getExtension("fermi.fermi-code");
    await ext?.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const cmd of [
      "fermi.newSession",
      "fermi.interruptTurn",
      "fermi.selectModel",
      "fermi.switchSession",
      "fermi.addFileToChat",
      "fermi.addSelectionToChat",
    ]) {
      assert.ok(commands.includes(cmd), `command not registered: ${cmd}`);
    }
  });
});

suite("binary resolver", () => {
  test("returns a well-formed result and a sane install dir", () => {
    const resolved = resolveFermiBinary();
    assert.ok(["path", "fermi-home", "not-found"].includes(resolved.source));
    if (resolved.source !== "not-found") {
      assert.ok(resolved.path.length > 0);
    }
    assert.ok(fermiInstallDir().endsWith("bin"));
  });
});

suite("webview bridge", () => {
  function fakeWebview(): vscode.Webview {
    return {
      asWebviewUri: (uri: vscode.Uri) => uri.with({ scheme: "https", authority: "file" }),
      cspSource: "https://file",
    } as unknown as vscode.Webview;
  }

  test("webview html has a nonce'd script and strict CSP", () => {
    const html = getWebviewHtml(fakeWebview(), vscode.Uri.file("/tmp/ext"));
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /default-src 'none'/);
    const nonce = html.match(/script-src 'nonce-([A-Za-z0-9]{32})'/);
    assert.ok(nonce, "missing script nonce in CSP");
    assert.ok(html.includes(`nonce="${nonce![1]}"`), "script tag nonce mismatch");
    assert.match(html, /webview\.js/);
  });

  function collectBackend(): { backend: WebviewBackend; requests: Array<{ method: string; params?: unknown }> } {
    const requests: Array<{ method: string; params?: unknown }> = [];
    const backend: WebviewBackend = {
      async request(method, params) {
        requests.push({ method, params });
        return { echoed: method };
      },
      newSession() {},
      selectModel() {},
      getInitialState() {
        return { method: "ready", params: { sessionId: "s1" } };
      },
    };
    return { backend, requests };
  }

  async function roundtrip(msg: WebviewToExtMessage, backend: WebviewBackend): Promise<ExtToWebviewMessage[]> {
    const posted: ExtToWebviewMessage[] = [];
    await handleWebviewMessage(msg, backend, (m) => posted.push(m));
    return posted;
  }

  test("ready replays the cached initial event", async () => {
    const { backend } = collectBackend();
    const posted = await roundtrip({ type: "ready" }, backend);
    assert.strictEqual(posted.length, 1);
    assert.deepStrictEqual(posted[0], { type: "event", method: "ready", params: { sessionId: "s1" } });
  });

  test("unknown rpc methods forward to the fermi backend", async () => {
    const { backend, requests } = collectBackend();
    const posted = await roundtrip(
      { type: "rpc", id: 7, method: "session.getStatus", params: { a: 1 } },
      backend,
    );
    assert.deepStrictEqual(requests, [{ method: "session.getStatus", params: { a: 1 } }]);
    assert.deepStrictEqual(posted[0], { type: "rpc-response", id: 7, result: { echoed: "session.getStatus" } });
  });

  test("__ext.getContext answers without touching the backend", async () => {
    const { backend, requests } = collectBackend();
    const posted = await roundtrip({ type: "rpc", id: 1, method: "__ext.getContext" }, backend);
    assert.strictEqual(requests.length, 0);
    const resp = posted[0] as { type: "rpc-response"; result: { workspaceName: string | null; branch: string | null } };
    assert.strictEqual(resp.type, "rpc-response");
    assert.ok("workspaceName" in resp.result && "branch" in resp.result);
  });

  test("__ext.gitBranches and __ext.gitLog respond with arrays", async () => {
    const { backend } = collectBackend();
    for (const method of ["__ext.gitBranches", "__ext.gitLog"]) {
      const posted = await roundtrip({ type: "rpc", id: 2, method }, backend);
      const resp = posted[0] as { type: "rpc-response"; result: unknown };
      assert.ok(Array.isArray(resp.result), `${method} should respond with an array`);
    }
  });

  test("__ext.searchFiles finds fixture files by name fragment", async () => {
    const { backend } = collectBackend();
    const posted = await roundtrip(
      { type: "rpc", id: 3, method: "__ext.searchFiles", params: { query: "hello" } },
      backend,
    );
    const resp = posted[0] as { type: "rpc-response"; result: string[] };
    assert.ok(Array.isArray(resp.result));
    assert.ok(
      resp.result.some((p) => p.endsWith("hello-world.ts")),
      `expected hello-world.ts in ${JSON.stringify(resp.result)}`,
    );
  });

  test("backend errors surface as rpc error responses", async () => {
    const backend: WebviewBackend = {
      async request() {
        throw new Error("server down");
      },
      newSession() {},
      selectModel() {},
      getInitialState() {
        return null;
      },
    };
    const posted = await roundtrip({ type: "rpc", id: 9, method: "session.getStatus" }, backend);
    assert.deepStrictEqual(posted[0], { type: "rpc-response", id: 9, error: "server down" });
  });
});
