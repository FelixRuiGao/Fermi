/**
 * Managed cloud provider credential slots.
 *
 * These providers always resolve credentials from Fermi-managed env vars.
 * External shell env vars are treated only as import candidates during setup.
 */

import { FACTORY_PROVIDER_SPECS } from "./model-registry.js";

export interface ManagedProviderCredentialSpec {
  providerId: string;
  internalEnvVar: string;
  externalEnvVars: string[];
}

/** Derived from provider specs with a managed credential (single source: providers.json). */
export const MANAGED_PROVIDER_CREDENTIAL_SPECS: ManagedProviderCredentialSpec[] =
  FACTORY_PROVIDER_SPECS.flatMap((spec) =>
    spec.credential.kind === "managed"
      ? [{
          providerId: spec.id,
          internalEnvVar: spec.credential.internalEnvVar,
          externalEnvVars: [...spec.credential.externalEnvVars],
        }]
      : [],
  );

const SPEC_BY_PROVIDER = new Map(
  MANAGED_PROVIDER_CREDENTIAL_SPECS.map((spec) => [spec.providerId, spec] as const),
);

export interface DetectedCredentialCandidate {
  envVar: string;
  value: string;
}

export function isManagedProvider(providerId: string): boolean {
  return SPEC_BY_PROVIDER.has(providerId);
}

export function getManagedCredentialSpec(
  providerId: string,
): ManagedProviderCredentialSpec | undefined {
  return SPEC_BY_PROVIDER.get(providerId);
}

export function getManagedCredentialEnvVar(
  providerId: string,
): string | undefined {
  return SPEC_BY_PROVIDER.get(providerId)?.internalEnvVar;
}

export function hasManagedCredential(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envVar = getManagedCredentialEnvVar(providerId);
  const raw = envVar ? env[envVar] : undefined;
  return typeof raw === "string" && raw.trim() !== "";
}

export function detectManagedCredentialCandidates(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): DetectedCredentialCandidate[] {
  const spec = getManagedCredentialSpec(providerId);
  if (!spec) return [];

  const out: DetectedCredentialCandidate[] = [];
  const seen = new Set<string>();
  for (const envVar of spec.externalEnvVars) {
    if (seen.has(envVar)) continue;
    seen.add(envVar);
    const raw = env[envVar];
    if (typeof raw === "string" && raw.trim() !== "") {
      out.push({ envVar, value: raw });
    }
  }
  return out;
}

export function hasAnyManagedCredential(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return MANAGED_PROVIDER_CREDENTIAL_SPECS.some((spec) => {
    const raw = env[spec.internalEnvVar];
    return typeof raw === "string" && raw.trim() !== "";
  });
}
