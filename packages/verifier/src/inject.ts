import type { SupabaseClient } from "@supabase/supabase-js";
import {
  boundsFor,
  equilibriumTemp,
  powerForEquilibrium,
  type GridState,
  type NodeMetrics,
} from "@verimesh/shared";
import type { Scenario } from "./scenarios";

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

  await supabase.from("events").insert({
    ts: Date.now(),
    type: "scenario",
    node_id: anomalyNode ?? null,
    message: `injected ${scenario.id}: ${scenario.title}`,
  });

  return { injection, state };
}
