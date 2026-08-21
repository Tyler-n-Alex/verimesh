import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REPEAT_OFFENDER_INCIDENTS,
  boundsFor,
  type GridState,
} from "@verimesh/shared";
import { BASELINE_METRICS, operatorOf, relocate, type Scenario } from "./scenarios";
import { readSignature, type Injection } from "./signature";

export {
  DRIVE_MARGIN_C,
  START_MARGIN_C,
  driveFor,
  driveNode,
  type Injection,
} from "./signature";

const HELD_STATUSES = ["awaiting_human", "isolated"];
const OPEN_GATE_STATUSES = ["pending", "authorized", "committing"];

export function anomalyNodeOf(scenario: Scenario): string | undefined {
  return scenario.anomalyNode;
}

export interface HistoryCheck {
  requirement: Scenario["history"];
  node: string;
  incidentCount: number | null;
  satisfied: boolean;
  detail: string;
}

export function checkHistory(
  scenario: Scenario,
  incidentCount: number | null
): HistoryCheck {
  const node = scenario.anomalyNode;

  if (scenario.history === "any") {
    return {
      requirement: "any",
      node,
      incidentCount,
      satisfied: true,
      detail: `${node} needs no particular history — its tier comes from the blast radius, not from the chain`,
    };
  }

  if (incidentCount === null) {
    return {
      requirement: scenario.history,
      node,
      incidentCount: null,
      satisfied: false,
      detail: `no subgraph to read ${node}'s incident count from — this scenario's tier is unverified`,
    };
  }

  const repeat = incidentCount >= REPEAT_OFFENDER_INCIDENTS;
  const satisfied = scenario.history === "repeat" ? repeat : !repeat;

  if (satisfied) {
    return {
      requirement: scenario.history,
      node,
      incidentCount,
      satisfied: true,
      detail:
        scenario.history === "repeat"
          ? `${node} has ${incidentCount} indexed incidents, at or over the ${REPEAT_OFFENDER_INCIDENTS} that make it a repeat offender`
          : `${node} has ${incidentCount} indexed incident(s), under the ${REPEAT_OFFENDER_INCIDENTS} that would escalate it`,
    };
  }

  return {
    requirement: scenario.history,
    node,
    incidentCount,
    satisfied: false,
    detail:
      scenario.history === "repeat"
        ? `${node} has only ${incidentCount} indexed incident(s) — under ${REPEAT_OFFENDER_INCIDENTS}, so the tier will not escalate and this scenario cannot show its beat`
        : `${node} has ${incidentCount} indexed incidents — at or over ${REPEAT_OFFENDER_INCIDENTS}, so this control case escalates to T1 instead of staying autonomous`,
  };
}

export function pickHistoryNode(
  scenario: Scenario,
  candidates: string[],
  incidentCounts: Record<string, number>
): string | undefined {
  if (scenario.history === "any" || !scenario.relocatable) {
    return scenario.anomalyNode;
  }

  const wantRepeat = scenario.history === "repeat";
  const operator = operatorOf(scenario.anomalyNode);

  const eligible = candidates
    .filter((id) => boundsFor(id) !== undefined)
    .filter((id) => operatorOf(id) === operator)
    .sort();

  const ordered = [
    scenario.anomalyNode,
    ...eligible.filter((id) => id !== scenario.anomalyNode),
  ];

  for (const id of ordered) {
    if (!boundsFor(id)) continue;
    if (operatorOf(id) !== operator) continue;
    const repeat = (incidentCounts[id] ?? 0) >= REPEAT_OFFENDER_INCIDENTS;
    if (repeat === wantRepeat) return id;
  }

  return undefined;
}

export interface ResolvedScenario {
  scenario: Scenario;
  relocatedFrom?: string;
  history: HistoryCheck;
}

export function resolveScenario(
  scenario: Scenario,
  candidates: string[],
  incidentCounts: Record<string, number> | null
): ResolvedScenario {
  if (incidentCounts === null) {
    return { scenario, history: checkHistory(scenario, null) };
  }

  const picked = pickHistoryNode(scenario, candidates, incidentCounts);

  if (!picked || picked === scenario.anomalyNode) {
    return {
      scenario,
      history: checkHistory(scenario, incidentCounts[scenario.anomalyNode] ?? 0),
    };
  }

  const moved = relocate(scenario, picked);
  return {
    scenario: moved,
    relocatedFrom: scenario.anomalyNode,
    history: checkHistory(moved, incidentCounts[picked] ?? 0),
  };
}

export interface InjectionReport {
  injection?: Injection;
  state: GridState;
  anomalyNode: string;
  ts: number;
  nodesFaulted: string[];
  nodesReset: string[];
  gatesCancelled: number[];
  heldReleased: string[];
}

interface NodeRow {
  id: string;
  status: string;
}

export function injectionOf(
  state: GridState,
  nodeId: string
): Injection | undefined {
  const signature = readSignature(state, nodeId);
  if (!signature || signature.equilibrium === undefined) return undefined;
  return {
    nodeId,
    load: signature.load,
    power: signature.power,
    temp: signature.temp,
    equilibrium: signature.equilibrium,
  };
}

export async function injectScenario(
  supabase: SupabaseClient,
  scenario: Scenario
): Promise<InjectionReport> {
  const ts = Date.now();
  const state = scenario.state();
  const anomalyNode = scenario.anomalyNode;

  const { data: gates } = await supabase
    .from("human_gates")
    .update({ status: "cancelled" })
    .in("status", OPEN_GATE_STATUSES)
    .select("id");

  const gatesCancelled = ((gates ?? []) as { id: number }[]).map((g) => g.id);

  const { data: rows } = await supabase
    .from("nodes")
    .select("id,status")
    .neq("kind", "device");

  const present = new Set(((rows ?? []) as NodeRow[]).map((row) => row.id));
  const heldReleased = ((rows ?? []) as NodeRow[])
    .filter((row) => HELD_STATUSES.includes(row.status))
    .map((row) => row.id)
    .sort();

  const faulted = new Set(Object.keys(scenario.faults));
  const nodesFaulted: string[] = [];
  const nodesReset: string[] = [];
  const telemetry: Record<string, unknown>[] = [];

  const ordered = [...state.nodes].sort((a, b) => a.id.localeCompare(b.id));

  for (const node of ordered) {
    if (!present.has(node.id)) continue;

    const isFault = faulted.has(node.id);
    const status = isFault ? node.status : "healthy";
    const metrics = isFault
      ? { ...node.metrics, ts }
      : { ...BASELINE_METRICS, ts };

    if (isFault) nodesFaulted.push(node.id);
    else nodesReset.push(node.id);

    await supabase
      .from("nodes")
      .update({
        status,
        metrics,
        updated_at: new Date(ts).toISOString(),
      })
      .eq("id", node.id);

    telemetry.push({
      node_id: node.id,
      ts,
      load: metrics.load,
      temp: metrics.temp,
      throughput: metrics.throughput,
      power: metrics.power,
      mem: metrics.mem,
      fan_rpm: metrics.fanRpm,
    });
  }

  if (telemetry.length > 0) {
    await supabase.from("telemetry").insert(telemetry);
  }

  const cleared: string[] = [];
  if (gatesCancelled.length > 0) {
    cleared.push(`cancelled ${gatesCancelled.length} open gate(s)`);
  }
  if (heldReleased.length > 0) {
    cleared.push(`released ${heldReleased.join(", ")}`);
  }

  await supabase.from("events").insert({
    ts,
    type: "scenario",
    node_id: anomalyNode,
    message: `injected ${scenario.id}: ${scenario.title} on ${anomalyNode}${
      cleared.length > 0 ? ` — ${cleared.join(", ")}` : ""
    }`,
  });

  return {
    injection: injectionOf(state, anomalyNode),
    state,
    anomalyNode,
    ts,
    nodesFaulted: nodesFaulted.sort(),
    nodesReset: nodesReset.sort(),
    gatesCancelled,
    heldReleased,
  };
}

export function describeInjection(state: GridState, nodeId: string): string {
  const signature = readSignature(state, nodeId);
  if (!signature) {
    return `${nodeId} has no thermal model in the blueprint — detection will never fire`;
  }

  const offline =
    signature.offlineNeighbours.length > 0
      ? `neighbour${signature.offlineNeighbours.length === 1 ? "" : "s"} ${signature.offlineNeighbours.join(", ")} offline`
      : "no neighbour loss";

  return `${nodeId} at load ${signature.load.toFixed(2)} / ${signature.power.toFixed(0)}W starts at ${signature.temp.toFixed(1)}°C and settles at ${(signature.equilibrium ?? 0).toFixed(1)}°C, over its ${signature.tempCeiling}°C ceiling — throughput ${signature.throughput.toFixed(0)} against ${signature.nominalAtLoad.toFixed(0)} nominal at this load, ${offline}`;
}
