/**
 * Remote model-registry delivery — fetch, verify, cache (Phase 6).
 *
 * At startup a best-effort background refresh pulls models.json / providers.json
 * (plus detached Ed25519 signatures) from the repo, verifies them against a
 * built-in public key, validates + version-gates via loadRemoteRegistry, and —
 * only if everything passes — caches and activates them in the current process.
 * Startup checks immediately, then polling continues every three minutes. Any failure
 * (network / signature / validation) is silent: the cache is left untouched and
 * the user keeps the last-known-good (or factory) tables.
 *
 * Signing model: plain Ed25519 detached signatures over the raw JSON bytes (a
 * `.sig` file = base64 of the 64-byte signature). Felix generates the keypair
 * once with scripts/gen-registry-key.ts and signs releases with
 * scripts/sign-registry.ts; the public key is embedded below. Until a real key
 * is embedded, verification fails closed → remote is never trusted, factory is
 * used. (minisign was the original recommendation; plain Ed25519 keeps the
 * verifier a few lines and avoids minisign's BLAKE2b-prehash format.)
 */

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getFermiHomeDir } from "./home-path.js";
import { VERSION } from "./version.js";
import { activateRemoteRegistry, getEffectiveRegistryRevision, loadRemoteRegistry, remoteCacheDir, type RawRegistryBundle } from "./registry-effective.js";
import { registryRevision } from "./model-registry.js";

/**
 * Built-in Ed25519 public key (SPKI PEM) for verifying the remote registry.
 * Replace with the output of `bun run scripts/gen-registry-key.ts`. Empty =
 * verification fails closed (remote never trusted).
 */
export const REGISTRY_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEApdQv3GlgMKD7y7DDdejGK3sxDMWHCJFvOO/PvaqitKY=\n-----END PUBLIC KEY-----\n";

const DEFAULT_BASE_URL =
  "https://raw.githubusercontent.com/felixruigao/fermi/main/assets/model-registry";

/** Stale-while-revalidate: how old a cache may be before we refetch. */
export const REGISTRY_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
export const REGISTRY_REFRESH_TTL_MS = REGISTRY_REFRESH_INTERVAL_MS;

export interface RegistryCacheMeta {
  fetchedAt: number;
  sourceUrl: string;
  appVersion: string;
}

export type FetchOutcome =
  | { status: "updated"; models: number; providers: number }
  | { status: "skipped"; reason: string }
  | { status: "rejected"; reason: string };

/** Verify a detached Ed25519 signature (base64) over `data` with an SPKI PEM key. */
export function verifyDetachedEd25519(data: Uint8Array, sigB64: string, publicKeyPem: string): boolean {
  if (!publicKeyPem || publicKeyPem.trim() === "") return false;
  try {
    const key = createPublicKey(publicKeyPem);
    return cryptoVerify(null, data, key, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal, redirect: "follow", cache: "no-store", headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export interface FetchOptions {
  baseUrl?: string;
  homeDir?: string;
  appVersion?: string;
  publicKeyPem?: string;
  /** Overall timeout for the whole fetch (ms). */
  timeoutMs?: number;
  now?: number;
  /** Live monitors activate the verified table; cache-only callers can opt out. */
  activate?: boolean;
  signal?: AbortSignal;
}

/**
 * Fetch + verify + validate + cache the remote registry. Returns an outcome; it
 * never throws (failures are reported, not propagated) so a background caller
 * can ignore the result. Live monitors also activate the table before returning.
 */
export async function fetchAndCacheRemoteRegistry(opts: FetchOptions = {}): Promise<FetchOutcome> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const homeDir = opts.homeDir ?? getFermiHomeDir();
  const appVersion = opts.appVersion ?? VERSION;
  const publicKeyPem = opts.publicKeyPem ?? REGISTRY_PUBLIC_KEY_PEM;
  const now = opts.now ?? Date.now();

  const controller = new AbortController();
  const abort = () => controller.abort();
  opts.signal?.addEventListener("abort", abort, { once: true });
  if (opts.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const [modelsTxt, modelsSig, providersTxt, providersSig] = await Promise.all([
      fetchText(`${baseUrl}/models.json`, controller.signal),
      fetchText(`${baseUrl}/models.json.sig`, controller.signal),
      fetchText(`${baseUrl}/providers.json`, controller.signal),
      fetchText(`${baseUrl}/providers.json.sig`, controller.signal),
    ]);

    const enc = new TextEncoder();
    if (!verifyDetachedEd25519(enc.encode(modelsTxt), modelsSig.trim(), publicKeyPem)) {
      return { status: "rejected", reason: "models.json signature invalid" };
    }
    if (!verifyDetachedEd25519(enc.encode(providersTxt), providersSig.trim(), publicKeyPem)) {
      return { status: "rejected", reason: "providers.json signature invalid" };
    }

    const bundle: RawRegistryBundle = {
      models: JSON.parse(modelsTxt),
      providers: JSON.parse(providersTxt),
    };
    // Validate + version-gate before caching so a bad table can never be cached.
    const { models, providers } = loadRemoteRegistry(bundle, appVersion);
    if (controller.signal.aborted) return { status: "skipped", reason: "refresh aborted" };
    if (opts.activate && registryRevision(bundle.models) < getEffectiveRegistryRevision()) {
      return { status: "rejected", reason: "registry revision is older than the active catalog" };
    }
    // Settle derivations before persisting: a catalog that cannot be applied
    // must not replace the last-good cache used by subsequent launches.
    if (opts.activate) activateRemoteRegistry(bundle, appVersion);

    const dir = remoteCacheDir(homeDir);
    mkdirSync(dir, { recursive: true });
    // Cache the RAW verified text (signature was over these exact bytes), plus meta.
    writeFileSync(join(dir, "models.json"), modelsTxt);
    writeFileSync(join(dir, "providers.json"), providersTxt);
    const meta: RegistryCacheMeta = { fetchedAt: now, sourceUrl: baseUrl, appVersion };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

    return { status: "updated", models: models.length, providers: providers.length };
  } catch (err) {
    return { status: "skipped", reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
  }
}

/** Read cache meta if present (for stale-while-revalidate decisions). */
export function readCacheMeta(homeDir: string): RegistryCacheMeta | null {
  try {
    const raw = readFileSync(join(remoteCacheDir(homeDir), "meta.json"), "utf8");
    const meta = JSON.parse(raw) as RegistryCacheMeta;
    return typeof meta.fetchedAt === "number" ? meta : null;
  } catch {
    return null;
  }
}

/** Stale-while-revalidate: should we refetch given the cache's age? */
export function shouldRefetch(meta: RegistryCacheMeta | null, now: number, ttlMs = REGISTRY_REFRESH_TTL_MS): boolean {
  if (!meta) return true;
  return now - meta.fetchedAt >= ttlMs;
}

/**
 * One process-wide monitor: immediate startup check, three-minute polling,
 * shared in-flight requests, and live activation after verification.
 */
export interface RegistryRefreshMonitor {
  ready: Promise<FetchOutcome>;
  stop: () => void;
}

let activeMonitor: { key: string; handle: RegistryRefreshMonitor } | null = null;

export function startBackgroundRegistryRefresh(opts: FetchOptions = {}): RegistryRefreshMonitor {
  const disabled = (reason: string): RegistryRefreshMonitor => ({
    ready: Promise.resolve({ status: "skipped", reason }), stop: () => {},
  });
  if (process.env.FERMI_REGISTRY_NO_REMOTE === "1") return disabled("remote registry disabled");
  // No public key embedded yet → remote can never be trusted, so don't even
  // make the network request. (Felix embeds the key via gen-registry-key.ts.)
  if ((opts.publicKeyPem ?? REGISTRY_PUBLIC_KEY_PEM).trim() === "") return disabled("no signing public key");
  const homeDir = opts.homeDir ?? getFermiHomeDir();
  const key = `${homeDir}\n${opts.baseUrl ?? DEFAULT_BASE_URL}\n${opts.appVersion ?? VERSION}`;
  if (activeMonitor?.key === key) return activeMonitor.handle;
  activeMonitor?.handle.stop();
  const controller = new AbortController();
  let inFlight: Promise<FetchOutcome> | null = null;
  const refresh = (): Promise<FetchOutcome> => {
    if (inFlight) return inFlight;
    if (controller.signal.aborted) return Promise.resolve({ status: "skipped", reason: "monitor stopped" });
    inFlight = fetchAndCacheRemoteRegistry({ ...opts, homeDir, activate: true, signal: controller.signal })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  const ready = refresh(); // Startup checks even when the disk cache was fetched recently.
  const timer = setInterval(() => { void refresh(); }, REGISTRY_REFRESH_INTERVAL_MS);
  timer.unref?.();
  const handle: RegistryRefreshMonitor = {
    ready,
    stop: () => {
      clearInterval(timer);
      controller.abort();
      if (activeMonitor?.handle === handle) activeMonitor = null;
    },
  };
  activeMonitor = { key, handle };
  return handle;
}
