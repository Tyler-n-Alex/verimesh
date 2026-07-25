import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boundsFor, type GridState, type NodeMetrics } from "@verimesh/shared";
import { scenarioById, type Scenario } from "@verimesh/verifier";
import { createAdminClient, logEvent } from "./db";
import { equilibriumTemp, powerForEquilibrium } from "./thermal";

export const DRIVE_MARGIN_C = 4;
export const START_MARGIN_C = 8;

export interface Injection {
  nodeId: string;
  load: number;
  power: number;
  temp: number;
  equilibrium: number;
}

export function anomalyNodeOf(scenario: Scenario): string | undefined {
  const targeted = scenario.proposal.target_nodes[0];
  if (targeted) return targeted;
  return Object.keys(scenario.faults)[0];
}

export function driveFor(
  nodeId: string,
  load: number,
  power: number
): Injection | undefined {
  const bounds = boundsFor(nodeId);
  if (!bounds) return undefined;

  const target = bounds.tempCeiling + DRIVE_MARGIN_C;
  const needed = powerForEquilibrium(nodeId, load, target);
  if (needed === undefined) return undefined;

  const driven = Math.min(
    Math.max(power, Math.ceil(needed)),
    Math.floor(bounds.powerCeiling * 0.9)
  );
  const equilibrium = equilibriumTemp(nodeId, load, driven);
  if (equilibrium === undefined) return undefined;

  return {
    nodeId,
    load,
    power: driven,
    temp: Math.min(bounds.tempWarn + START_MARGIN_C, bounds.tempCeiling - 1),
    equilibrium,
  };
}

export async function injectScenario(
  supabase: SupabaseClient,
  scenario: Scenario
): Promise<{ injection?: Injection; state: GridState }> {
  const state = scenario.state();
  const anomalyNode = anomalyNodeOf(scenario);

  let injection: Injection | undefined;

  for (const node of state.nodes) {
    const patch = scenario.faults[node.id];
    if (!patch) continue;

    let metrics: NodeMetrics = { ...node.metrics, ts: Date.now() };

    if (node.id === anomalyNode && node.status !== "offline") {
      injection = driveFor(node.id, metrics.load, metrics.power);
      if (injection) {
        metrics = {
          ...metrics,
          power: injection.power,
          temp: injection.temp,
        };
      }
    }

    await supabase
      .from("nodes")
      .update({
        status: node.status,
        metrics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);

    await supabase.from("telemetry").insert({
      node_id: node.id,
      ts: metrics.ts,
      load: metrics.load,
      temp: metrics.temp,
      throughput: metrics.throughput,
      power: metrics.power,
      mem: metrics.mem,
      fan_rpm: metrics.fanRpm,
    });
  }

  await logEvent(
    supabase,
    "scenario",
    `injected ${scenario.id}: ${scenario.title}`
  );

  return { injection, state };
}

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
