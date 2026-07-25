import fs from "node:fs";
import path from "node:path";

const CLIENT_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_WORLDID_APP_ID",
  "NEXT_PUBLIC_SUBGRAPH_URL",
  "NEXT_PUBLIC_REGISTRY_EXPLORER",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_WORLDID_ACTION",
];

function parse(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function loadRootEnv(appDir) {
  const rootEnv = path.join(appDir, "..", "..", ".env.local");
  if (!fs.existsSync(rootEnv)) {
    console.warn(
      `[verimesh] no root .env.local at ${rootEnv} — copy .env.example to .env.local at the repo root`
    );
    return {};
  }

  const parsed = parse(fs.readFileSync(rootEnv, "utf8"));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }

  const explorer = process.env.REGISTRY_EXPLORER;
  if (explorer && !process.env.NEXT_PUBLIC_REGISTRY_EXPLORER) {
    process.env.NEXT_PUBLIC_REGISTRY_EXPLORER = explorer;
  }
  const registry = process.env.REGISTRY_ADDRESS;
  if (registry && !process.env.NEXT_PUBLIC_REGISTRY_ADDRESS) {
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = registry;
  }
  const action = process.env.WORLDID_ACTION;
  if (action && !process.env.NEXT_PUBLIC_WORLDID_ACTION) {
    process.env.NEXT_PUBLIC_WORLDID_ACTION = action;
  }
  const subgraph = process.env.SUBGRAPH_URL;
  if (subgraph && !process.env.NEXT_PUBLIC_SUBGRAPH_URL) {
    process.env.NEXT_PUBLIC_SUBGRAPH_URL = subgraph;
  }

  const exposed = {};
  for (const key of CLIENT_KEYS) {
    if (process.env[key]) exposed[key] = process.env[key];
  }
  return exposed;
}
