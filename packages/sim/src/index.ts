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
  updated_at: string;
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
    nodes: nodes.slice().sort((a, b) => a.id.localeCompare(b.id)).map((n) => ({
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

async function loadState(
  supabase: SupabaseClient
): Promise<{ state: GridState; seen: Map<string, string> }> {
  const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError }] =
    await Promise.all([
      supabase.from("nodes").select("*").neq("kind", "device").order("id"),
      supabase.from("edges").select("from_node,to_node,weight").order("id"),
    ]);

  if (nodesError) throw nodesError;
  if (edgesError) throw edgesError;

  const rows = (nodes ?? []) as DbNode[];
  const seen = new Map(rows.map((row) => [row.id, row.updated_at]));
  const grid = toGridState(rows, (edges ?? []) as DbEdge[]);

  return {
    state: {
      ...grid,
      nodes: grid.nodes.map((node) => applyPatch(node, activeFaults[node.id])),
    },
    seen,
  };
}

async function persistState(
  supabase: SupabaseClient,
  state: GridState,
  seen: Map<string, string>
): Promise<string[]> {
  const ts = Date.now();
  const written: string[] = [];

  for (const node of state.nodes) {
    const previous = seen.get(node.id);
    if (previous === undefined) continue;

    const { data, error } = await supabase
      .from("nodes")
      .update({
        status: node.status,
        metrics: node.metrics,
        updated_at: new Date(ts).toISOString(),
      })
      .eq("id", node.id)
      .eq("updated_at", previous)
      .select("id");

    if (error) throw error;
    if ((data ?? []).length > 0) written.push(node.id);
  }

  if (written.length === 0) return written;

  const owned = new Set(written);
  const telemetry = state.nodes
    .filter((node) => owned.has(node.id))
    .map((node) => ({
      node_id: node.id,
      ts: node.metrics.ts,
      load: node.metrics.load,
      temp: node.metrics.temp,
      throughput: node.metrics.throughput,
      power: node.metrics.power,
      mem: node.metrics.mem,
      fan_rpm: node.metrics.fanRpm,
    }));

  const { error: telemetryError } = await supabase
    .from("telemetry")
    .insert(telemetry);
  if (telemetryError) throw telemetryError;

  return written;
}

export interface TickResult {
  state: GridState;
  written: string[];
  skipped: string[];
}

export function stampNow(state: GridState, ts: number): GridState {
  return {
    ...state,
    nodes: state.nodes.map((node) => ({
      ...node,
      metrics: { ...node.metrics, ts },
    })),
  };
}

export async function tickOnce(supabase: SupabaseClient): Promise<TickResult> {
  const { state: current, seen } = await loadState(supabase);
  const next = stampNow(step(current), Date.now());
  const written = await persistState(supabase, next, seen);
  const owned = new Set(written);
  return {
    state: next,
    written,
    skipped: next.nodes
      .filter((node) => seen.has(node.id) && !owned.has(node.id))
      .map((node) => node.id),
  };
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
        const tick = await tickOnce(supabase);
        if (tick.skipped.length > 0) {
          console.log(
            `[sim] ${tick.skipped.join(", ")} changed under this tick — leaving the newer write in place`
          );
        }
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
