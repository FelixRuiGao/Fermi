/**
 * Effective model/provider registry = factory defaults OR a validated, version-
 * gated remote override. Initialized from disk, then replaced atomically when
 * a newer signed catalog arrives. Exported collections keep their identity so
 * existing consumers see the new contents without restarting.
 *
 * Phase 5 only LOADS a locally-cached remote bundle if present and valid; the
 * network fetch + signature verification that POPULATE that cache live in
 * Phase 6. Any problem (missing/corrupt/invalid/over-version) falls back to
 * factory, so the user is never left without a usable model list.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getFermiHomeDir } from "./home-path.js";
import { VERSION } from "./version.js";
import {
  FACTORY_MODEL_SPECS,
  FACTORY_PROVIDER_SPECS,
  type DerivedModelTables,
  type ModelSpec,
  type ProviderSpec,
  deriveModelTables,
  loadModelSpecs,
  loadProviderSpecs,
  modelSpecIds,
  registryRevision,
  FACTORY_REGISTRY_REVISION,
} from "./model-registry.js";

// ------------------------------------------------------------------
// Minimal semver compare — gating only (numeric major.minor.patch; any
// prerelease suffix is ignored, i.e. a prerelease counts as its base version).
// ------------------------------------------------------------------

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split("-")[0]!.split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isVersionAtLeast(version: string, min: string): boolean {
  return compareVersions(version, min) >= 0;
}

// ------------------------------------------------------------------
// Remote bundle → validated, version-gated specs
// ------------------------------------------------------------------

export interface RawRegistryBundle {
  models: unknown;
  providers: unknown;
}

export interface EffectiveRegistry {
  models: ModelSpec[];
  providers: ProviderSpec[];
  source: "factory" | "remote";
  revision: number;
}

/**
 * Validate + version-gate a remote bundle. Throws on structural invalidity so
 * the caller can fall back to factory (whole-table replacement). Model/provider
 * entries whose minAppVersion exceeds appVersion are dropped — one published
 * table can serve both new and old app versions, each taking what it can run.
 */
export function loadRemoteRegistry(
  bundle: RawRegistryBundle,
  appVersion: string,
): { models: ModelSpec[]; providers: ProviderSpec[] } {
  if (registryRevision(bundle.models) !== registryRevision(bundle.providers)) {
    throw new Error("model/provider registry revisions must match");
  }
  const allModels = loadModelSpecs(bundle.models);
  const models = allModels.filter(
    (s) => !s.minAppVersion || isVersionAtLeast(appVersion, s.minAppVersion),
  );
  const allModelIds = new Set(allModels.flatMap(modelSpecIds));
  const gatedModelIds = new Set(models.flatMap(modelSpecIds));

  // Pre-filter providers by their OWN minAppVersion before validation, so a
  // future provider (e.g. with a providerClass this version's code doesn't know)
  // is dropped rather than sinking the whole table on an older app.
  const providersObj = bundle.providers as { schemaVersion?: number; providers?: unknown[] };
  const rawProviders = providersObj?.providers;
  if (!Array.isArray(rawProviders)) {
    throw new Error("provider registry: expected { schemaVersion, providers: [...] }");
  }
  const gatedRawProviders = rawProviders.filter((p) => {
    const min = (p as { minAppVersion?: string })?.minAppVersion;
    return !min || isVersionAtLeast(appVersion, min);
  });

  // Validate refs against ALL models (ungated) so a genuinely-missing spec still
  // errors, but a ref to a version-gated-out model is dropped afterward.
  const providers = loadProviderSpecs(
    { schemaVersion: providersObj.schemaVersion ?? 0, providers: gatedRawProviders },
    allModelIds,
  ).map((p) => ({
    ...p,
    models: p.models.filter((ref) => ref.spec === undefined || gatedModelIds.has(ref.spec)),
  }));

  return { models, providers };
}

// ------------------------------------------------------------------
// Cache I/O + effective selection
// ------------------------------------------------------------------

/** Directory holding the cached remote registry (populated by Phase 6 fetch). */
export function remoteCacheDir(homeDir: string): string {
  return join(homeDir, "model-registry", "cache");
}

function tryReadCachedRemoteSync(homeDir: string): RawRegistryBundle | null {
  const dir = remoteCacheDir(homeDir);
  const mPath = join(dir, "models.json");
  const pPath = join(dir, "providers.json");
  if (!existsSync(mPath) || !existsSync(pPath)) return null;
  try {
    return {
      models: JSON.parse(readFileSync(mPath, "utf8")),
      providers: JSON.parse(readFileSync(pPath, "utf8")),
    };
  } catch {
    return null;
  }
}

/**
 * Pick the effective registry: a valid, version-gated cached remote bundle if
 * one is present, else the bundled factory defaults. `FERMI_REGISTRY_NO_REMOTE=1`
 * forces factory (used to keep tests / debugging deterministic).
 */
export function selectEffectiveRegistry(homeDir: string, appVersion: string): EffectiveRegistry {
  if (process.env.FERMI_REGISTRY_NO_REMOTE !== "1") {
    const cached = tryReadCachedRemoteSync(homeDir);
    if (cached) {
      try {
        // A previously signed catalog must not roll back a newer binary's
        // bundled model list. Date-style monotonic revisions are independent
        // of minAppVersion, which gates adapter compatibility rather than age.
        if (registryRevision(cached.models) <= FACTORY_REGISTRY_REVISION) {
          return { models: FACTORY_MODEL_SPECS, providers: FACTORY_PROVIDER_SPECS, source: "factory", revision: FACTORY_REGISTRY_REVISION };
        }
        const { models, providers } = loadRemoteRegistry(cached, appVersion);
        return { models, providers, source: "remote", revision: registryRevision(cached.models) };
      } catch {
        // Corrupt / invalid / over-version cache → fall through to factory.
      }
    }
  }
  return { models: FACTORY_MODEL_SPECS, providers: FACTORY_PROVIDER_SPECS, source: "factory", revision: FACTORY_REGISTRY_REVISION };
}

const _effective = selectEffectiveRegistry(getFermiHomeDir(), VERSION);

/** The model specs actually in effect this process (factory ∨ remote). */
export const EFFECTIVE_MODEL_SPECS: ModelSpec[] = [..._effective.models];
/** The provider specs actually in effect this process (factory ∨ remote). */
export const EFFECTIVE_PROVIDER_SPECS: ProviderSpec[] = [..._effective.providers];
/** Derived capability tables for the effective model specs. */
export const EFFECTIVE_MODEL_TABLES: DerivedModelTables = deriveModelTables(_effective.models);
/** Whether the effective registry came from the bundled defaults or a remote override. */
export let EFFECTIVE_REGISTRY_SOURCE: "factory" | "remote" = _effective.source;

let effectiveRevision = _effective.revision;
let generation = 0;
const derivedListeners = new Set<() => void>();
const runtimeListeners = new Set<() => void>();

export function getRegistryGeneration(): number { return generation; }
export function getEffectiveRegistryRevision(): number { return effectiveRevision; }

/** Derivations settle first; runtime/UI observers then see one coherent catalog. */
export function subscribeEffectiveRegistry(listener: () => void, phase: "derived" | "runtime" = "runtime"): () => void {
  const listeners = phase === "derived" ? derivedListeners : runtimeListeners;
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function replaceContents(next: { models: ModelSpec[]; providers: ProviderSpec[] }): void {
  const tables = deriveModelTables(next.models);
  EFFECTIVE_MODEL_SPECS.splice(0, EFFECTIVE_MODEL_SPECS.length, ...next.models);
  EFFECTIVE_PROVIDER_SPECS.splice(0, EFFECTIVE_PROVIDER_SPECS.length, ...next.providers);
  for (const key of ["contextLengths", "maxOutputTokens", "thinkingLevels", "labelOverrides"] as const) {
    const target = EFFECTIVE_MODEL_TABLES[key];
    for (const id of Object.keys(target)) delete target[id];
    Object.assign(target, tables[key]);
  }
  for (const key of ["multimodal", "thinking", "noWebSearch", "extendedCache"] as const) {
    const target = EFFECTIVE_MODEL_TABLES[key];
    target.clear();
    for (const id of tables[key]) target.add(id);
  }
  for (const listener of derivedListeners) listener();
}

/** Called only after signature verification; rejects rollback and duplicate revisions. */
export function activateRemoteRegistry(bundle: RawRegistryBundle, appVersion = VERSION): boolean {
  const next = loadRemoteRegistry(bundle, appVersion);
  const revision = registryRevision(bundle.models);
  if (revision <= effectiveRevision) return false;
  const previous = { models: [...EFFECTIVE_MODEL_SPECS], providers: [...EFFECTIVE_PROVIDER_SPECS] };
  try {
    replaceContents(next);
  } catch (error) {
    replaceContents(previous);
    throw error;
  }
  effectiveRevision = revision;
  EFFECTIVE_REGISTRY_SOURCE = "remote";
  generation++;
  for (const listener of runtimeListeners) {
    try { listener(); } catch { /* One UI observer cannot stop catalog delivery. */ }
  }
  return true;
}
