import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeNullifier,
  operatorsFor,
  type AuthzConfig,
} from "@verimesh/shared";
import { createAdminClient } from "./db";
import { deriveDemoSigner, liveAuthzConfig } from "./demoSigners";

export const GUARD = "ALLOW_SIMULATED_APPROVALS";

export function simulationAllowed(): boolean {
  return process.env[GUARD] === "true";
}

export async function recordSimulatedApproval(
  supabase: SupabaseClient,
  gateId: number,
  operator: string,
  nodeId: string | null,
  chosenAction: string,
  nullifier = simulatedNullifier(operator)
): Promise<{ ok: boolean; nullifier: string; error?: string }> {
  if (!simulationAllowed()) {
    return { ok: false, nullifier, error: `${GUARD} is not true` };
  }

  const ts = Date.now();
  const { error } = await supabase.from("human_approvals").insert({
    gate_id: gateId,
    nullifier,
    operator,
    chosen_action: chosenAction,
    ts,
  });

  if (error) {
    return { ok: false, nullifier, error: error.message };
  }

  await supabase.from("events").insert({
    ts,
    type: "approval",
    node_id: nodeId,
    message: `SIMULATED signer authorized gate ${gateId} as ${operator} — not a World ID scan`,
  });

  return { ok: true, nullifier };
}

interface GateRow {
  id: number;
  proposal_id: number;
  status: string;
  required_tier: string;
  required_quorum: number;
  operators_required: string[] | null;
  reason: string | null;
  chosen_action: string | null;
  proposals: { node_id: string; proposed_action: string } | null;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

export function simulatedNullifier(operator: string): string {
  return deriveDemoSigner(operator);
}

function usage(): void {
  console.log("usage:");
  console.log(
    "  pnpm --filter @verimesh/agent approve [<gateId>|latest] [--operator opA] [--nullifier 0x…]"
  );
  console.log("");
  console.log(
    `This stands in for a World ID scan. It is refused unless ${GUARD}=true, because a`
  );
  console.log(
    "simulated signer proves nothing about personhood — it exists so the freeze branch,"
  );
  console.log(
    "the quorum, resolveOverride and the commit can be tested without two phones."
  );
}

async function main(): Promise<void> {
  if (!simulationAllowed()) {
    console.error(
      `refusing to fabricate a human approval: set ${GUARD}=true to allow it`
    );
    console.error(
      "on the demo machine this must stay unset — every approval should come from a real scan"
    );
    process.exit(1);
  }

  const positional = process.argv[2];
  if (positional === "--help" || positional === "-h") {
    usage();
    return;
  }

  const supabase = createAdminClient();

  const query = supabase
    .from("human_gates")
    .select("*, proposals(node_id,proposed_action)")
    .in("status", ["pending", "authorized"])
    .order("ts", { ascending: false })
    .limit(1);

  const { data, error } =
    positional && positional !== "latest"
      ? await supabase
          .from("human_gates")
          .select("*, proposals(node_id,proposed_action)")
          .eq("id", Number(positional))
          .limit(1)
      : await query;

  if (error) throw error;

  const gate = (data ?? [])[0] as GateRow | undefined;
  if (!gate) {
    console.error(
      positional && positional !== "latest"
        ? `no gate ${positional}`
        : "no open gate — nothing is waiting on a human"
    );
    process.exit(1);
  }

  const required = gate.operators_required ?? [];

  const { data: existing } = await supabase
    .from("human_approvals")
    .select("nullifier,operator")
    .eq("gate_id", gate.id);

  const taken = new Set((existing ?? []).map((row) => row.operator as string));
  const operator =
    flag("operator") ??
    required.find((op) => !taken.has(op)) ??
    required[0] ??
    "opA";

  const rawNullifier = flag("nullifier");
  const nullifier = rawNullifier
    ? normalizeNullifier(rawNullifier)
    : simulatedNullifier(operator);

  const chosen =
    flag("action") ??
    gate.chosen_action ??
    gate.proposals?.proposed_action ??
    "NO_OP";

  const config = liveAuthzConfig() as AuthzConfig;
  const enrolled = Object.values(config.operators).flat().length > 0;
  const enrolledFor = operatorsFor(config, nullifier);

  if (enrolled && !enrolledFor.includes(operator)) {
    console.error(
      `${nullifier} is not enrolled to ${operator}, and the allowlist is being enforced —`
    );
    console.error(
      `the agent will refuse this approval. Enrol it first, or pass one that is:`
    );
    console.error(
      `  pnpm --filter @verimesh/agent enrol ${operator} ${nullifier}`
    );
    process.exit(1);
  }

  const ts = Date.now();
  const { error: insertError } = await supabase.from("human_approvals").insert({
    gate_id: gate.id,
    nullifier,
    operator,
    chosen_action: chosen,
    ts,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      console.error(
        `rejected by the unique index: ${nullifier} has already authorized gate ${gate.id}`
      );
      console.error(
        "that is the distinctness rule working — pass --operator for the other slot"
      );
      process.exit(1);
    }
    throw insertError;
  }

  await supabase.from("events").insert({
    ts,
    type: "approval",
    node_id: gate.proposals?.node_id ?? null,
    message: `SIMULATED signer authorized gate ${gate.id} as ${operator} — not a World ID scan`,
  });

  const filled = new Set([...taken, operator]);
  const collected = (existing ?? []).length + 1;

  console.log(
    `gate ${gate.id} (${gate.required_tier}, quorum ${gate.required_quorum}) — ${operator} filled by ${nullifier}`
  );
  console.log(
    `${collected} of ${gate.required_quorum} slot(s) filled; operators covered ${[...filled].join(", ") || "none"}`
  );

  const outstanding = required.filter((op) => !filled.has(op));
  if (outstanding.length > 0) {
    console.log(`still waiting on ${outstanding.join(", ")}`);
    return;
  }

  console.log(
    "quorum met — the agent loop will resolve the gate, call resolveOverride, then commit"
  );
}

if (basename(process.argv[1] ?? "") === "approve.ts") {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
