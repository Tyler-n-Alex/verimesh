import { readFileSync } from "node:fs";
import { join } from "node:path";
import { authzConfig, type AuthzConfig } from "@verimesh/shared";

const CANDIDATES = [
  join(process.cwd(), "../../packages/shared/src/authz_config.json"),
  join(process.cwd(), "packages/shared/src/authz_config.json"),
];

export interface LiveAuthzConfig {
  config: AuthzConfig;
  source: "disk" | "bundled";
}

export function loadAuthzConfig(): LiveAuthzConfig {
  for (const path of CANDIDATES) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as AuthzConfig;
      if (parsed && typeof parsed === "object" && parsed.operators) {
        return { config: parsed, source: "disk" };
      }
    } catch {
      continue;
    }
  }
  return { config: authzConfig as AuthzConfig, source: "bundled" };
}

export function enrolledTotal(config: AuthzConfig): number {
  return Object.values(config.operators).flat().length;
}
