import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchIncidentCounts } from "@verimesh/chain";
import {
  describeInjection,
  injectScenario,
  resolveScenario,
  scenarioById,
  SCENARIOS,
  type ResolvedScenario,
  type Scenario,
} from "@verimesh/verifier";
import { createAdminClient } from "./db";

export {
  anomalyNodeOf,
  checkHistory,
  describeInjection,
  driveFor,
  injectScenario,
  injectionOf,
  pickHistoryNode,
  resolveScenario,
  DRIVE_MARGIN_C,
  START_MARGIN_C,
  type HistoryCheck,
  type Injection,
  type InjectionReport,
  type ResolvedScenario,
} from "@verimesh/verifier";

const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? "";

export async function simNodeIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("nodes")
    .select("id")
    .neq("kind", "device")
    .order("id");
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

export async function incidentCountsFor(
  nodeIds: string[]
): Promise<Record<string, number> | null> {
  if (!SUBGRAPH_URL) return null;

  try {
    return await fetchIncidentCounts(SUBGRAPH_URL, nodeIds);
  } catch (err) {
    console.error(
      "[scenario] the subgraph would not answer, so history preconditions are unchecked:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function prepareScenario(
  supabase: SupabaseClient,
  scenario: Scenario
): Promise<ResolvedScenario> {
  const candidates = await simNodeIds(supabase);
  const counts =
    scenario.history === "any" ? null : await incidentCountsFor(candidates);
  return resolveScenario(scenario, candidates, counts);
}

async function main(): Promise<void> {
  const scenarioId = process.argv[2];
  if (!scenarioId) {
    console.error(
      `usage: pnpm scenario <${SCENARIOS.map((s) => s.id).join("|")}>`
    );
    process.exit(1);
  }

  const declared = scenarioById(scenarioId);
  if (!declared) {
    console.error(
      `unknown scenario ${scenarioId} — have ${SCENARIOS.map((s) => s.id).join(", ")}`
    );
    process.exit(1);
  }

  const supabase = createAdminClient();
  const resolved = await prepareScenario(supabase, declared);
  const scenario = resolved.scenario;

  const report = await injectScenario(supabase, scenario);

  console.log(`[scenario] ${scenario.id} — ${scenario.narrative}`);

  if (resolved.relocatedFrom) {
    console.log(
      `[scenario] moved off ${resolved.relocatedFrom} onto ${scenario.anomalyNode} to satisfy its history precondition`
    );
  }

  console.log(
    `[scenario] history: ${resolved.history.satisfied ? "ok" : "NOT SATISFIED"} — ${resolved.history.detail}`
  );

  console.log(`[scenario] ${describeInjection(report.state, report.anomalyNode)}`);

  if (report.gatesCancelled.length > 0) {
    console.log(
      `[scenario] cancelled ${report.gatesCancelled.length} open gate(s) so the detector is not skipping a frozen node`
    );
  }
  if (report.heldReleased.length > 0) {
    console.log(
      `[scenario] released ${report.heldReleased.join(", ")} out of a held state`
    );
  }
  console.log(
    `[scenario] ${report.nodesReset.length} node(s) returned to baseline, ${report.nodesFaulted.length} faulted: ${report.nodesFaulted.join(", ")}`
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
