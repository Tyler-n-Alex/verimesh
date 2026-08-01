import { createHash } from "node:crypto";
import {
  demoModeEnabled,
  mergeDemoSigners,
  normalizeNullifier,
  parseDemoSigners,
  DEMO_SIGNERS_ENV,
  DEMO_SIGNER_SEED,
  type AuthzConfig,
  type DemoSigners,
} from "@verimesh/shared";
import { loadAuthzConfig } from "@/lib/authzConfig";

export const SIMULATION_GUARD = "ALLOW_SIMULATED_APPROVALS";

export const DEMO_OFF =
  "demo mode is off — set NEXT_PUBLIC_DEMO_MODE=true to enable the simulated controls";

export const SIMULATION_OFF = `simulated approvals are refused — set ${SIMULATION_GUARD}=true to allow them`;

export function deriveDemoSigner(operator: string): string {
  const digest = createHash("sha256")
    .update(`${DEMO_SIGNER_SEED}:${operator}`)
    .digest("hex");
  return normalizeNullifier(`0x${digest}`);
}

export function demoModeOn(): boolean {
  return demoModeEnabled(process.env);
}

export function simulationAllowed(): boolean {
  return process.env[SIMULATION_GUARD] === "true";
}

export function demoSigners(operators: string[]): DemoSigners {
  if (!demoModeOn()) return {};

  const configured = parseDemoSigners(process.env[DEMO_SIGNERS_ENV]);
  if (Object.keys(configured).length > 0) return configured;

  const derived: DemoSigners = {};
  for (const operator of operators) {
    derived[operator] = [deriveDemoSigner(operator)];
  }
  return derived;
}

export interface DemoAuthzConfig {
  config: AuthzConfig;
  signers: DemoSigners;
  source: "disk" | "bundled";
}

export function liveAuthzConfig(operators: string[]): DemoAuthzConfig {
  const { config, source } = loadAuthzConfig();
  const signers = demoSigners(
    operators.length > 0 ? operators : Object.keys(config.operators)
  );
  return { config: mergeDemoSigners(config, signers), signers, source };
}

export function demoSignerFor(
  signers: DemoSigners,
  operator: string
): string | undefined {
  return signers[operator]?.[0];
}
