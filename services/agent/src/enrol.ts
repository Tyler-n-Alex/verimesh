import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeNullifier, type AuthzConfig } from "@verimesh/shared";

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(
  here,
  "../../../packages/shared/src/authz_config.json"
);

function load(): AuthzConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AuthzConfig;
}

function save(config: AuthzConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function enrolledCount(config: AuthzConfig): number {
  return Object.values(config.operators).flat().length;
}

function report(config: AuthzConfig): void {
  console.log("");
  for (const [operator, nullifiers] of Object.entries(config.operators)) {
    if (nullifiers.length === 0) {
      console.log(`  ${operator}  (nobody enrolled)`);
      continue;
    }
    for (const nullifier of nullifiers) {
      console.log(`  ${operator}  ${nullifier}`);
    }
  }
  console.log("");

  const total = enrolledCount(config);
  if (total === 0) {
    console.log(
      "The allowlist is empty, so /api/worldid/verify falls back to self-enrolment:"
    );
    console.log(
      "ANY verified World ID human can authorize ANY gate. Personhood is checked, authority is not."
    );
    console.log(
      "`pnpm --filter @verimesh/verifier acceptance` reports C5.2 allowlist-truth RED until this is non-empty."
    );
    return;
  }

  console.log(
    `${total} nullifier(s) enrolled — the self-enrolment fallback is now OFF and the allowlist is enforced.`
  );
  console.log(
    "Restart the Next.js dev server: authz_config.json is imported at module load."
  );
}

function usage(): void {
  console.log("usage:");
  console.log("  pnpm --filter @verimesh/agent enrol --list");
  console.log("  pnpm --filter @verimesh/agent enrol <operator> <nullifier>");
  console.log("  pnpm --filter @verimesh/agent enrol --last <operator>");
  console.log(
    "  pnpm --filter @verimesh/agent enrol --remove <operator> <nullifier>"
  );
  console.log("  pnpm --filter @verimesh/agent enrol --clear");
  console.log("");
  console.log(
    "Get a nullifier by scanning with no gate open — POST /api/worldid/verify with"
  );
  console.log(
    'only { "idkitResponse": ... } returns the canonical nullifier and records nothing.'
  );
  console.log(
    "That scan is logged as a `worldid` event, so `--last <operator>` enrols whoever"
  );
  console.log(
    "just scanned without anyone retyping 66 characters of hex at a booth."
  );
}

async function lastScannedNullifier(): Promise<string | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error(
      "--last needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY"
    );
    return undefined;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("events")
    .select("message,ts")
    .eq("type", "worldid")
    .order("ts", { ascending: false })
    .limit(1);

  if (error) {
    console.error(`could not read the events feed: ${error.message}`);
    return undefined;
  }

  const message = (data ?? [])[0]?.message as string | undefined;
  const match = message?.match(/0x[0-9a-fA-F]{64}/);
  if (!match) {
    console.error(
      "no World ID identity check on record — scan once with no gate open first"
    );
    return undefined;
  }
  return match[0];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config = load();

  if (args[0] === "--last") {
    const operator = args[1];
    if (!operator) {
      usage();
      process.exit(1);
    }
    const nullifier = await lastScannedNullifier();
    if (!nullifier) process.exit(1);
    console.log(`last identity checked: ${nullifier}`);
    args.splice(0, 2, operator, nullifier);
  }

  if (args.length === 0 || args[0] === "--list") {
    report(config);
    if (args.length === 0) {
      console.log("");
      usage();
    }
    return;
  }

  if (args[0] === "--clear") {
    for (const operator of Object.keys(config.operators)) {
      config.operators[operator] = [];
    }
    save(config);
    console.log("cleared every operator allowlist");
    report(config);
    return;
  }

  const remove = args[0] === "--remove";
  const [operator, ...rawNullifiers] = remove ? args.slice(1) : args;

  if (!operator || rawNullifiers.length === 0) {
    usage();
    process.exit(1);
  }

  if (!(operator in config.operators)) {
    console.error(
      `unknown operator ${operator} — authz_config.json has ${Object.keys(config.operators).join(", ")}`
    );
    process.exit(1);
  }

  for (const raw of rawNullifiers) {
    let nullifier: string;
    try {
      nullifier = normalizeNullifier(raw);
    } catch (err) {
      console.error(
        `${raw} is not a usable nullifier: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }

    const current = config.operators[operator];
    const already = current.some((entry) => {
      try {
        return normalizeNullifier(entry) === nullifier;
      } catch {
        return false;
      }
    });

    if (remove) {
      config.operators[operator] = current.filter((entry) => {
        try {
          return normalizeNullifier(entry) !== nullifier;
        } catch {
          return true;
        }
      });
      console.log(
        already
          ? `removed ${nullifier} from ${operator}`
          : `${nullifier} was not enrolled to ${operator}`
      );
      continue;
    }

    const elsewhere = Object.entries(config.operators)
      .filter(([other]) => other !== operator)
      .filter(([, list]) =>
        list.some((entry) => {
          try {
            return normalizeNullifier(entry) === nullifier;
          } catch {
            return false;
          }
        })
      )
      .map(([other]) => other);

    if (elsewhere.length > 0) {
      console.log(
        `note: ${nullifier} is also enrolled to ${elsewhere.join(", ")} — one human can then fill two quorum slots on their own`
      );
    }

    if (already) {
      console.log(`${nullifier} is already enrolled to ${operator}`);
      continue;
    }

    config.operators[operator] = [...current, nullifier];
    console.log(`enrolled ${nullifier} to ${operator}`);
  }

  save(config);
  report(config);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
