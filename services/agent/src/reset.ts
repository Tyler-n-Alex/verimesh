import { createAdminClient } from "./db";
import { seed } from "./seed";

const STALE_STATUSES = ["awaiting_human", "isolated"];

async function loopIsRunning(): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("telemetry")
    .select("ts,source")
    .neq("source", "real")
    .order("ts", { ascending: false })
    .limit(1);

  const latest = (data ?? [])[0];
  if (!latest) return false;
  return Date.now() - Number(latest.ts) < 15_000;
}

async function reset(): Promise<void> {
  const supabase = createAdminClient();

  const running = await loopIsRunning();
  if (running) {
    console.log("");
    console.log("⚠️  the agent loop is still writing telemetry.");
    console.log(
      "   Stop it first (Ctrl-C) — the simulator holds the injected fault in memory"
    );
    console.log("   and will write it straight back on the next tick.");
    console.log("");
  }

  const { data: gates } = await supabase
    .from("human_gates")
    .update({ status: "cancelled" })
    .in("status", ["pending", "authorized"])
    .select("id,required_tier,required_quorum");

  console.log(
    gates && gates.length > 0
      ? `cancelled ${gates.length} open gate(s): ${gates
          .map((g) => `${g.id} (${g.required_tier} quorum ${g.required_quorum})`)
          .join(", ")}`
      : "no open gates"
  );

  const { data: stuck } = await supabase
    .from("nodes")
    .select("id,status")
    .in("status", STALE_STATUSES);

  if (stuck && stuck.length > 0) {
    console.log(
      `clearing ${stuck.length} held node(s): ${stuck
        .map((n) => `${n.id} (${n.status})`)
        .join(", ")}`
    );
  }

  await seed();

  const { count } = await supabase
    .from("edges")
    .select("id", { count: "exact", head: true });

  console.log(`edges now ${count ?? 0}`);
  console.log("");

  if (running) {
    console.log("Now restart the agent loop, or this reset will not hold:");
  } else {
    console.log("Start the agent loop:");
  }
  console.log("  pnpm --filter @verimesh/agent start");
  console.log("");
  console.log("Then:");
  console.log("  pnpm --filter @verimesh/agent run-scenario recurring_fault --timeout 300");
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
