import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  GridNode,
  GridState,
  NodeMetrics,
  NodeStatus,
  Proposal,
} from "@verimesh/shared";
import { applyAction } from "@verimesh/verifier";

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  }
  return createClient(url, key, { auth: { persistSession: false } });
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

export async function loadGridState(supabase: SupabaseClient): Promise<GridState> {
  const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError }] =
    await Promise.all([
      supabase.from("nodes").select("*").order("id"),
      supabase.from("edges").select("from_node,to_node,weight").order("id"),
    ]);

  if (nodesError) throw nodesError;
  if (edgesError) throw edgesError;

  return {
    nodes: ((nodes ?? []) as DbNode[]).map((n) => ({
      id: n.id,
      name: n.name,
      operator: n.operator_id,
      pos: [n.x, n.y, n.z],
      status: n.status,
      metrics: n.metrics,
    })),
    edges: ((edges ?? []) as DbEdge[]).map((e) => ({
      from: e.from_node,
      to: e.to_node,
      weight: e.weight,
    })),
  };
}

export async function gridFingerprint(
  supabase: SupabaseClient,
  nodeIds?: string[]
): Promise<string> {
  let query = supabase.from("nodes").select("id,status,metrics,updated_at");
  if (nodeIds && nodeIds.length > 0) {
    query = query.in("id", nodeIds);
  }
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as DbNode[];
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows.map((n) => `${n.id}:${n.status}`).join("|");
}

export function relevantNodeIds(state: GridState, nodeId: string): string[] {
  const neighbors = state.edges
    .filter((e) => e.from === nodeId || e.to === nodeId)
    .map((e) => (e.from === nodeId ? e.to : e.from));
  return Array.from(new Set([nodeId, ...neighbors]));
}

export async function fetchTelemetryWindow(
  supabase: SupabaseClient,
  nodeId: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("telemetry")
    .select("*")
    .eq("node_id", nodeId)
    .order("ts", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    node_id: row.node_id,
    ts: row.ts,
    load: row.load,
    temp: row.temp,
    throughput: row.throughput,
    power: row.power,
    mem: row.mem,
    fan_rpm: row.fan_rpm,
  }));
}

export async function logEvent(
  supabase: SupabaseClient,
  type: string,
  message: string,
  nodeId?: string
): Promise<void> {
  await supabase.from("events").insert({
    ts: Date.now(),
    type,
    node_id: nodeId ?? null,
    message,
  });
}

export async function applyActionToGrid(
  supabase: SupabaseClient,
  action: string,
  targetNodes: string[]
): Promise<{ applied: string[]; reason: string }> {
  if (action === "NO_OP") {
    return { applied: [], reason: "NO_OP changes nothing" };
  }

  const state = await loadGridState(supabase);
  const proposal: Proposal = {
    diagnosis: "committed decision",
    proposed_action: action as Proposal["proposed_action"],
    target_nodes: targetNodes,
    expected_effect: "apply the action the verifier projected",
    confidence: 1,
    risk_flags: [],
  };

  const projected = applyAction(state, proposal);
  if (!projected.projectable) {
    return { applied: [], reason: projected.reason };
  }

  const before = new Map(state.nodes.map((n) => [n.id, n]));
  const ts = Date.now();
  const applied: string[] = [];

  for (const node of projected.state.nodes) {
    const previous = before.get(node.id);
    if (!previous) continue;
    if (
      previous.status === node.status &&
      previous.metrics.load === node.metrics.load &&
      previous.metrics.power === node.metrics.power &&
      previous.metrics.throughput === node.metrics.throughput
    ) {
      continue;
    }

    const status = node.status === "offline" ? "isolated" : node.status;

    await supabase
      .from("nodes")
      .update({
        status,
        metrics: { ...node.metrics, ts },
        updated_at: new Date(ts).toISOString(),
      })
      .eq("id", node.id);

    applied.push(node.id);
  }

  return { applied: applied.sort(), reason: projected.reason };
}
