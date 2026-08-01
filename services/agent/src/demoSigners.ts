import { createHash } from "node:crypto";
import {
  authzConfig,
  demoModeEnabled,
  mergeDemoSigners,
  normalizeNullifier,
  parseDemoSigners,
  DEMO_SIGNERS_ENV,
  DEMO_SIGNER_SEED,
  type AuthzConfig,
  type DemoSigners,
} from "@verimesh/shared";

export function deriveDemoSigner(operator: string): string {
  const digest = createHash("sha256")
    .update(`${DEMO_SIGNER_SEED}:${operator}`)
    .digest("hex");
  return normalizeNullifier(`0x${digest}`);
}

export function demoModeOn(): boolean {
  return demoModeEnabled(process.env);
}

export function demoSigners(): DemoSigners {
  if (!demoModeOn()) return {};

  const configured = parseDemoSigners(process.env[DEMO_SIGNERS_ENV]);
  if (Object.keys(configured).length > 0) return configured;

  const derived: DemoSigners = {};
  for (const operator of Object.keys(
    (authzConfig as AuthzConfig).operators
  )) {
    derived[operator] = [deriveDemoSigner(operator)];
  }
  return derived;
}

export function liveAuthzConfig(): AuthzConfig {
  return mergeDemoSigners(authzConfig as AuthzConfig, demoSigners());
}
