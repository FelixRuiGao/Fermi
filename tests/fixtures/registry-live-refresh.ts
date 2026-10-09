import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FACTORY_MODEL_SPECS, FACTORY_PROVIDER_SPECS, FACTORY_REGISTRY_REVISION } from "../../src/model-registry.js";
import { EFFECTIVE_MODEL_SPECS, activateRemoteRegistry, getEffectiveRegistryRevision, getRegistryGeneration, subscribeEffectiveRegistry } from "../../src/registry-effective.js";
import { startBackgroundRegistryRefresh, REGISTRY_REFRESH_INTERVAL_MS } from "../../src/registry-fetch.js";
import { Config, KNOWN_CONTEXT_LENGTHS, getThinkingLevels, getExtendedCacheSupport } from "../../src/config.js";
import { findProviderPreset, buildProviderPresetRawConfig } from "../../src/provider-presets.js";
import { getProviderDefaultBaseUrl } from "../../src/provider-defaults.js";
import { describeModel } from "../../src/model-presentation.js";
import { providerCredentialKind } from "../../src/managed-provider-credentials.js";
import { createProvider } from "../../src/providers/registry.js";
import { Agent } from "../../src/agents/agent.js";
import { BaseProvider, ProviderResponse, Usage } from "../../src/providers/base.js";
import { Session } from "../../src/session.js";
import { registerSessionRpc } from "../../src/server/session-rpc.js";

const home = mkdtempSync(join(tmpdir(), "fermi-live-registry-"));
process.env.FERMI_HOME = home;
delete process.env.FERMI_REGISTRY_NO_REMOTE;
process.env.FERMI_LIVE_TEST_KEY = "test-key";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const base = "https://example.test/catalog";
let models = structuredClone(FACTORY_MODEL_SPECS);
let providers = structuredClone(FACTORY_PROVIDER_SPECS);
let files: Record<string, string>;
let requests = 0;
let holdFetch = false;
const publish = (revision: number) => {
  const m = JSON.stringify({ schemaVersion: 1, registryRevision: revision, models });
  const p = JSON.stringify({ schemaVersion: 1, registryRevision: revision, providers });
  files = {
    [`${base}/models.json`]: m,
    [`${base}/models.json.sig`]: sign(null, Buffer.from(m), privateKey).toString("base64"),
    [`${base}/providers.json`]: p,
    [`${base}/providers.json.sig`]: sign(null, Buffer.from(p), privateKey).toString("base64"),
  };
};
publish(FACTORY_REGISTRY_REVISION + 1);
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  requests++;
  if (holdFetch) await new Promise<void>((_resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort, { once: true });
  });
  return { ok: true, text: async () => files[String(url)] } as Response;
}) as typeof fetch;

// A real signed startup fetch with an injected timer lets us verify the exact
// three-minute cadence and overlap handling without waiting three minutes.
const originalInterval = globalThis.setInterval;
const originalClear = globalThis.clearInterval;
let tick: () => void = () => {};
let scheduledMs = 0;
let cleared = false;
const timer = { unref() {} };
globalThis.setInterval = ((callback: () => void, ms: number) => {
  tick = callback; scheduledMs = ms; return timer;
}) as typeof setInterval;
globalThis.clearInterval = ((value: ReturnType<typeof setInterval>) => {
  if (value === timer as any) cleared = true;
  else originalClear(value);
}) as typeof clearInterval;

const config = new Config({ providerEnvVars: { openai: "FERMI_LIVE_TEST_KEY", "live-provider": "FERMI_LIVE_TEST_KEY" } });
config.upsertModelRaw("explicit", { provider: "openai", model: "gpt-5.4", api_key: "${FERMI_LIVE_TEST_KEY}", context_length: 123456 });
config.removeModel("openai:gpt-5.5");
const runtimeConfig = new Config({});
const oldPreset = findProviderPreset("openai")!.models.find(m => m.id === "gpt-5.4")!;
runtimeConfig.upsertModelRaw("runtime-preset", buildProviderPresetRawConfig("openai", oldPreset, "${FERMI_LIVE_TEST_KEY}"));
runtimeConfig.bindModelToPreset("runtime-preset", "openai", oldPreset.key);
const startingConfig = config.getModel("openai:gpt-5.4");
const tableIdentity = KNOWN_CONTEXT_LENGTHS;
const specsIdentity = EFFECTIVE_MODEL_SPECS;

let releaseRequest!: () => void;
let enteredRequest!: () => void;
const gate = new Promise<void>(resolve => { releaseRequest = resolve; });
const entered = new Promise<void>(resolve => { enteredRequest = resolve; });
const calls: Array<{ context: number; thinking?: string }> = [];
class ScriptedProvider extends BaseProvider {
  async sendMessage(_messages: unknown, _tools?: unknown, options?: any): Promise<ProviderResponse> {
    const first = calls.length === 0;
    calls.push({ context: agent.modelConfig.contextLength, thinking: options?.thinkingLevel });
    if (first) {
      enteredRequest();
      await gate;
      options?.onToolCallClosed?.({ id: "clock", name: "time", rawArguments: "{}", arguments: {}, parseError: null });
      return new ProviderResponse({ usage: new Usage(50, 5) });
    }
    return new ProviderResponse({ text: "done", usage: new Usage(50, 5) });
  }
}
const agent = new Agent({ name: "main", modelConfig: startingConfig, tools: [{ name: "time", description: "time", parameters: { type: "object", properties: {} } }] });
(agent as any)._provider = new ScriptedProvider();
const replace = agent.replaceModelConfig.bind(agent);
agent.replaceModelConfig = mc => { replace(mc); (agent as any)._provider = new ScriptedProvider(); };
const session = new Session({ primaryAgent: agent, config, projectRoot: home, sessionArtifactsDir: join(home, "artifacts") });
const events: string[] = [];
const rpc = registerSessionRpc({ session, workDir: home, sessionDir: null, onShutdown: async () => {}, server: { on() {}, emit(method: string) { events.push(method); }, close() {} } as any });
let monitor: ReturnType<typeof startBackgroundRegistryRefresh> | undefined;
let turn: Promise<unknown> | undefined;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
try {
  mkdirSync(join(home, "model-registry", "cache"), { recursive: true });
  writeFileSync(join(home, "model-registry", "cache", "meta.json"), JSON.stringify({ fetchedAt: Date.now(), appVersion: "1.0.0", sourceUrl: base }));
  monitor = startBackgroundRegistryRefresh({ baseUrl: base, homeDir: home, appVersion: "1.0.0", publicKeyPem });
  globalThis.setInterval = originalInterval;
  assert.equal(scheduledMs, 180000);
  assert.equal(REGISTRY_REFRESH_INTERVAL_MS, 180000);
  assert.equal((await monitor.ready).status, "updated");
  assert.equal(requests, 4, "startup must check even with a fresh disk cache");
  assert.equal(startBackgroundRegistryRefresh({ baseUrl: base, homeDir: home, appVersion: "1.0.0", publicKeyPem }), monitor);
  assert.equal(events.filter(e => e === "model.changed").length, 1);

  turn = session.turn("verify a live catalog update during a tool loop");
  await entered;
  const inFlightConfig = agent.modelConfig;
  const next = models.find(m => m.id === "gpt-5.4")!;
  next.contextLength = 299999;
  next.displayName = "Live GPT";
  next.thinkingLevels = ["none", "low", "medium"];
  next.extendedCache = false;
  providers.find(p => p.id === "openai")!.models.find(m => m.spec === "gpt-5.4")!.config = { context_length: 299999 };
  models.push({ id: "live-model", displayName: "Live Model", contextLength: 65536, maxOutputTokens: 2048, multimodal: true, thinkingLevels: ["low", "high"], webSearch: false });
  models.push({ id: "future-model", displayName: "Future Model", contextLength: 65536, multimodal: false, thinkingLevels: [], webSearch: false, minAppVersion: "99.0.0" });
  providers.push({ id: "live-provider", name: "Live Provider", brand: "Live Brand", providerLabel: "Live Endpoint", defaultBaseUrl: "https://example.test/v1", credential: { kind: "env", envVar: "FERMI_LIVE_TEST_KEY" }, providerClass: "openai-responses", wire: { transportProtocol: "responses", thinkingEncryption: "none", sealedSchema: null }, models: [{ spec: "live-model" }, { spec: "future-model" }] });
  publish(FACTORY_REGISTRY_REVISION + 2);
  tick();
  await settle();
  assert.equal(getEffectiveRegistryRevision(), FACTORY_REGISTRY_REVISION + 2);
  assert.equal(KNOWN_CONTEXT_LENGTHS, tableIdentity);
  assert.equal(EFFECTIVE_MODEL_SPECS, specsIdentity);
  assert.equal(KNOWN_CONTEXT_LENGTHS["gpt-5.4"], 299999);
  assert.equal(FACTORY_MODEL_SPECS.find(m => m.id === "gpt-5.4")!.contextLength, startingConfig.contextLength);
  assert.deepEqual(getThinkingLevels("gpt-5.4"), ["none", "low", "medium"]);
  assert.equal(getExtendedCacheSupport("gpt-5.4"), false);
  assert.equal(config.getModel("openai:gpt-5.4").contextLength, 299999);
  assert.equal(config.getModel("explicit").contextLength, 123456);
  assert.equal(config.modelNames.includes("openai:gpt-5.5"), false);
  assert.equal(runtimeConfig.getModel("runtime-preset").contextLength, 299999);
  assert.ok(runtimeConfig.modelNames.includes("openai:gpt-6-sol"));
  assert.equal(getProviderDefaultBaseUrl("live-provider"), "https://example.test/v1");
  assert.equal(providerCredentialKind("live-provider"), "env");
  const live = config.getModel("live-provider:live-model");
  assert.equal(live.transportProtocol, "responses");
  assert.equal(createProvider(live).constructor.name, "OpenAIResponsesProvider");
  assert.equal(describeModel({ providerId: "live-provider", modelId: "live-model" }).brandLabel, "Live Brand");
  assert.ok(!config.modelNames.includes("live-provider:future-model"));
  assert.equal(agent.modelConfig, inFlightConfig, "in-flight model config must stay stable");
  assert.equal(events.filter(e => e === "model.changed").length, 2);
  releaseRequest();
  await turn;
  assert.deepEqual(calls.map(c => c.context), [startingConfig.contextLength, 299999]);
  assert.deepEqual(calls.map(c => c.thinking), ["xhigh", "medium"]);
  assert.equal(agent.modelConfig.model, "gpt-5.4", "catalog refresh must preserve the selected model");

  const generation = getRegistryGeneration();
  tick(); await settle();
  assert.equal(getRegistryGeneration(), generation, "unchanged catalogs must not rebuild clients");
  assert.equal(events.filter(e => e === "model.changed").length, 2);
  publish(FACTORY_REGISTRY_REVISION + 3);
  files[`${base}/models.json.sig`] = "invalid";
  tick(); await settle();
  assert.equal(getRegistryGeneration(), generation, "bad signatures must keep the current catalog");
  assert.equal(JSON.parse(readFileSync(join(home, "model-registry", "cache", "models.json"), "utf8")).registryRevision, FACTORY_REGISTRY_REVISION + 2);
  assert.equal(activateRemoteRegistry({ models: { schemaVersion: 1, registryRevision: FACTORY_REGISTRY_REVISION + 1, models }, providers: { schemaVersion: 1, registryRevision: FACTORY_REGISTRY_REVISION + 1, providers } }, "1.0.0"), false);

  // A derivation error must restore every live consumer and leave the cache intact.
  let failDerivation = true;
  const unsubscribe = subscribeEffectiveRegistry(() => {
    if (failDerivation) { failDerivation = false; throw new Error("test derivation failure"); }
  }, "derived");
  publish(FACTORY_REGISTRY_REVISION + 3);
  tick(); await settle();
  unsubscribe();
  assert.equal(getRegistryGeneration(), generation);
  assert.equal(KNOWN_CONTEXT_LENGTHS["gpt-5.4"], 299999);
  assert.equal(JSON.parse(readFileSync(join(home, "model-registry", "cache", "models.json"), "utf8")).registryRevision, FACTORY_REGISTRY_REVISION + 2);

  const networkFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  tick(); await settle();
  globalThis.fetch = networkFetch;
  assert.equal(getRegistryGeneration(), generation);

  // An outstanding download is shared by all interval ticks and aborts on stop.
  const beforeOverlap = requests;
  holdFetch = true;
  tick(); tick();
  assert.equal(requests, beforeOverlap + 4);
  monitor.stop();
  await settle();
  assert.ok(cleared);
  tick();
  assert.equal(requests, beforeOverlap + 4);
  console.log("live registry: startup, cadence, activation, consumers, request boundary, gating, failures, disposal passed");
} finally {
  releaseRequest();
  monitor?.stop();
  rpc.dispose();
  if (turn) await turn.catch(() => {});
  await session.close();
  globalThis.fetch = originalFetch;
  globalThis.setInterval = originalInterval;
  globalThis.clearInterval = originalClear;
  rmSync(home, { recursive: true, force: true });
}
