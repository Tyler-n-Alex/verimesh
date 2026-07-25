import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  blueprint,
  step,
  type GridNode,
  type GridState,
  type NodeMetrics,
  type NodeStatus,
} from "@verimesh/shared";

export interface NodePatch {
  load?: number;
  temp?: number;
  throughput?: number;
  power?: number;
  mem?: number;
  fanRpm?: number;
  status?: NodeStatus;
}

export interface SimOptions {
  intervalMs?: number;
  supabaseUrl: string;
  serviceKey: string;
  faults?: Record<string, NodePatch>;
}

interface DbNode {
  id: string;
  name: string;
  operator_id: string;
  x: number;
  y: number;
  z: number;
  status: NodeStatus;
  metrics: NodeMetrics;
}

interface DbEdge {
  from_node: string;
  to_node: string;
  weight: number;
}

let activeFaults: Record<string, NodePatch> = {};

export function setFaults(faults: Record<string, NodePatch>): void {
  activeFaults = { ...faults };
}

export function clearFaults(): void {
  activeFaults = {};
}

export function getFaults(): Record<string, NodePatch> {
  return { ...activeFaults };
}

function applyPatch(node: GridNode, patch?: NodePatch): GridNode {
  if (!patch) return node;
  const { status, ...metrics } = patch;
  return {
    ...node,
    status: status ?? node.status,
    metrics: { ...node.metrics, ...metrics },
  };
}

function toGridState(nodes: DbNode[], edges: DbEdge[]): GridState {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      operator: n.operator_id,
      pos: [n.x, n.y, n.z],
      status: n.status,
      metrics: n.metrics,
    })),
    edges: edges.map((e) => ({
      from: e.from_node,
      to: e.to_node,
      weight: e.weight,
    })),
  };
}

async function loadState(supabase: SupabaseClient): Promise<GridState> {
  const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError }] =
    await Promise.all([
      supabase.from("nodes").select("*").neq("kind", "device"),
      supabase.from("edges").select("from_node,to_node,weight"),
    ]);

  if (nodesError) throw nodesError;
  if (edgesError) throw edgesError;

  const grid = toGridState((nodes ?? []) as DbNode[], (edges ?? []) as DbEdge[]);
  return {
    ...grid,
    nodes: grid.nodes.map((node) => applyPatch(node, activeFaults[node.id])),
  };
}

async function persistState(
  supabase: SupabaseClient,
  state: GridState
): Promise<void> {
  const ts = Date.now();
  const updates = state.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    operator_id: node.operator,
    status: node.status,
    metrics: node.metrics,
    updated_at: new Date(ts).toISOString(),
  }));

  const { error: nodeError } = await supabase.from("nodes").upsert(updates, {
    onConflict: "id",
  });
  if (nodeError) throw nodeError;

  const telemetry = state.nodes.map((node) => ({
    node_id: node.id,
    ts: node.metrics.ts,
    load: node.metrics.load,
    temp: node.metrics.temp,
    throughput: node.metrics.throughput,
    power: node.metrics.power,
    mem: node.metrics.mem,
    fan_rpm: node.metrics.fanRpm,
  }));

  const { error: telemetryError } = await supabase.from("telemetry").insert(telemetry);
  if (telemetryError) throw telemetryError;
}

export async function tickOnce(supabase: SupabaseClient): Promise<GridState> {
  const current = await loadState(supabase);
  const next = step(current);
  await persistState(supabase, next);
  return next;
}

export async function runSimulator(options: SimOptions): Promise<() => void> {
  const supabase = createClient(options.supabaseUrl, options.serviceKey, {
    auth: { persistSession: false },
  });

  if (options.faults) {
    activeFaults = { ...options.faults };
  }

  const intervalMs = options.intervalMs ?? 5000;
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        await tickOnce(supabase);
      } catch (err) {
        console.error("[sim]", err instanceof Error ? err.message : err);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  void loop();

  return () => {
    running = false;
  };
}

export function parseFaultEnv(raw: string | undefined): Record<string, NodePatch> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, NodePatch>;
  } catch {
    return {};
  }
}

export const DEFAULT_INTERVAL_MS = 5000;

export { blueprint };
