import { basename } from "node:path";
import { injectScenario, scenarioById } from "@verimesh/verifier";
import { createAdminClient } from "./db";

export {
  anomalyNodeOf,
  driveFor,
  injectScenario,
  DRIVE_MARGIN_C,
  START_MARGIN_C,
  type Injection,
} from "@verimesh/verifier";

async function main(): Promise<void> {
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

  const supabase = createAdminClient();
  const { injection } = await injectScenario(supabase, scenario);

  console.log(`[scenario] ${scenario.id} — ${scenario.narrative}`);

  if (!injection) {
    console.log(
      "[scenario] no thermal drive applied — the fault may decay before the agent sees it"
    );
    return;
  }

  console.log(
    `[scenario] ${injection.nodeId} driven to ${injection.power}W at load ${injection.load.toFixed(2)}: starts at ${injection.temp.toFixed(1)}°C and settles at ${injection.equilibrium.toFixed(1)}°C`
  );
  console.log(
    "[scenario] the simulator recomputes temperature every tick, so the fault holds instead of decaying"
  );
}

if (basename(process.argv[1] ?? "") === "scenario.ts") {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
