import { scenarioById } from "@verimesh/verifier";
import { setFaults } from "@verimesh/sim";
import { createAdminClient, logEvent } from "./db";

async function main() {
  const scenarioId = process.argv[2];
  if (!scenarioId) {
    console.error("usage: pnpm scenario <scenario-id>");
    process.exit(1);
  }

  const scenario = scenarioById(scenarioId);
  if (!scenario) {
    console.error(`unknown scenario ${scenarioId}`);
    process.exit(1);
  }

  setFaults(scenario.faults);

  const supabase = createAdminClient();
  const state = scenario.state();

  for (const node of state.nodes) {
    await supabase
      .from("nodes")
      .update({
        status: node.status,
        metrics: node.metrics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);
  }

  await logEvent(
    supabase,
    "scenario",
    `injected ${scenario.id}: ${scenario.title}`
  );

  console.log(`[scenario] ${scenario.id} — ${scenario.narrative}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

