import { normalizeNullifier } from "./nullifier";
import type { AuthzConfig } from "./types";

export const DEMO_MODE_ENV = "NEXT_PUBLIC_DEMO_MODE";
export const DEMO_SIGNERS_ENV = "DEMO_SIGNER_NULLIFIERS";
export const DEMO_SIGNER_SEED = "verimesh-simulated-signer";

export type DemoSigners = Record<string, string[]>;

export interface EnvLike {
  [key: string]: string | undefined;
}

export function demoModeEnabled(env: EnvLike): boolean {
  return env[DEMO_MODE_ENV] === "true";
}

export function parseDemoSigners(raw: string | undefined): DemoSigners {
  if (!raw) return {};

  const signers: DemoSigners = {};
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const split = trimmed.indexOf(":");
    if (split === -1) continue;

    const operator = trimmed.slice(0, split).trim();
    const candidate = trimmed.slice(split + 1).trim();
    if (!operator || !candidate) continue;

    let nullifier: string;
    try {
      nullifier = normalizeNullifier(candidate);
    } catch {
      continue;
    }

    const existing = signers[operator] ?? [];
    if (!existing.includes(nullifier)) existing.push(nullifier);
    signers[operator] = existing;
  }

  return signers;
}

export function formatDemoSigners(signers: DemoSigners): string {
  return Object.entries(signers)
    .flatMap(([operator, nullifiers]) =>
      nullifiers.map((nullifier) => `${operator}:${nullifier}`)
    )
    .join(",");
}

export function mergeDemoSigners(
  config: AuthzConfig,
  signers: DemoSigners
): AuthzConfig {
  if (Object.keys(signers).length === 0) return config;

  const operators: Record<string, string[]> = {};
  for (const [operator, enrolled] of Object.entries(config.operators)) {
    operators[operator] = enrolled.slice();
  }

  for (const [operator, nullifiers] of Object.entries(signers)) {
    const existing = operators[operator] ?? [];
    for (const nullifier of nullifiers) {
      if (!existing.some((entry) => sameNullifier(entry, nullifier))) {
        existing.push(nullifier);
      }
    }
    operators[operator] = existing;
  }

  return { ...config, operators };
}

export function isDemoSigner(
  signers: DemoSigners,
  nullifier: string
): boolean {
  for (const nullifiers of Object.values(signers)) {
    if (nullifiers.some((entry) => sameNullifier(entry, nullifier))) return true;
  }
  return false;
}

export function demoOperatorsFor(
  signers: DemoSigners,
  nullifier: string
): string[] {
  return Object.entries(signers)
    .filter(([, nullifiers]) =>
      nullifiers.some((entry) => sameNullifier(entry, nullifier))
    )
    .map(([operator]) => operator)
    .sort();
}

function sameNullifier(a: string, b: string): boolean {
  try {
    return normalizeNullifier(a) === normalizeNullifier(b);
  } catch {
    return false;
  }
}
