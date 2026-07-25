import type { AuthTier, GridNode, NodeMetrics, NodeStatus } from "@verimesh/shared";

export interface DeviceMetrics {
  socTemp?: number | null;
  battery?: number | null;
  charging?: boolean | null;
  tempSource?: string | null;
  // Which mechanism produced `load`. "procstat" is the kernel's own utilisation
  // counter; "contention" is scheduler run-delay, used on handsets where
  // Android denies /proc/stat. They are different quantities, so the inspector
  // must name whichever was actually measured.
  loadSource?: string | null;
  // Sent by the ingest route so the browser uses the bounds the server actually
  // classified with, rather than the module defaults it would otherwise fall
  // back to (DEVICE_* env vars are not NEXT_PUBLIC_ and do not reach the client).
  bounds?: {
    T_warn: number;
    T_max: number;
    L_max: number;
    X_nominal: number;
  } | null;
  tempGates?: boolean | null;
}

export interface NodeRow {
  id: string;
  name: string;
  operator_id: string;
  x: number;
  y: number;
  z: number;
  status: string;
  metrics: (Partial<NodeMetrics> & DeviceMetrics) | null;
  updated_at: string;
  kind?: string | null;
  device_label?: string | null;
  last_seen_at?: string | null;
}

export interface EdgeRow {
  id: number;
  from_node: string;
  to_node: string;
  weight: number;
}

export interface TelemetryRow {
  id: number;
  node_id: string;
  ts: number;
  load: number | null;
  temp: number | null;
  throughput: number | null;
  power: number | null;
  mem: number | null;
  fan_rpm: number | null;
}

export interface EventRow {
  id: number;
  ts: number;
  type: string;
  node_id: string | null;
  message: string | null;
}

export interface ProposalRow {
  id: number;
  ts: number;
  node_id: string | null;
  diagnosis: string | null;
  proposed_action: string | null;
  target_nodes: string[] | null;
  expected_effect: string | null;
  confidence: number | null;
  risk_flags: string[] | null;
  llm_provider: string | null;
  zerog_inference_valid: boolean | null;
  zerog_root: string | null;
  auth_tier: AuthTier | null;
}

export interface VerdictRow {
  id: number;
  proposal_id: number;
  verdict: string;
  detail: string | null;
  violated: Record<string, unknown> | null;
  projected: Record<string, NodeMetrics> | null;
  ts: number;
}

export interface CommitRow {
  id: number;
  proposal_id: number;
  applied_action: string | null;
  zerog_root: string | null;
  chain_tx_hash: string | null;
  ts: number;
  auth_tier: AuthTier | null;
  human_authorized: boolean;
}

export interface GateRow {
  id: number;
  proposal_id: number;
  status: string;
  world_id_nullifier: string | null;
  chosen_action: string | null;
  ts: number;
  required_tier: AuthTier;
  required_quorum: number;
  operators_required: string[] | null;
  reason: string | null;
  resolved_tx_hash: string | null;
}

export interface ApprovalRow {
  id: number;
  gate_id: number;
  nullifier: string;
  operator: string;
  chosen_action: string | null;
  ts: number;
}

export interface MeshNode extends GridNode {
  updatedAt: number;
  kind: "sim" | "device";
  deviceLabel: string | null;
  lastSeenAt: number | null;
  device: DeviceMetrics;
}

export interface TelemetryPoint {
  ts: number;
  load: number;
  temp: number;
  throughput: number;
  power: number;
  mem: number;
  fanRpm: number;
}

const ZERO_METRICS: NodeMetrics = {
  ts: 0,
  load: 0,
  temp: 0,
  throughput: 0,
  power: 0,
  mem: 0,
  fanRpm: 0,
};

const NODE_STATUSES: NodeStatus[] = [
  "healthy",
  "warning",
  "violation",
  "awaiting_human",
  "isolated",
  "offline",
];

export function coerceStatus(raw: string | null | undefined): NodeStatus {
  if (raw && (NODE_STATUSES as string[]).includes(raw)) return raw as NodeStatus;
  return "offline";
}

export function coerceMetrics(raw: Partial<NodeMetrics> | null): NodeMetrics {
  if (!raw) return { ...ZERO_METRICS };
  return {
    ts: Number(raw.ts ?? 0),
    load: Number(raw.load ?? 0),
    temp: Number(raw.temp ?? 0),
    throughput: Number(raw.throughput ?? 0),
    power: Number(raw.power ?? 0),
    mem: Number(raw.mem ?? 0),
    fanRpm: Number(raw.fanRpm ?? 0),
  };
}

export function mapNode(row: NodeRow): MeshNode {
  return {
    id: row.id,
    name: row.name,
    operator: row.operator_id,
    pos: [Number(row.x), Number(row.y), Number(row.z)],
    status: coerceStatus(row.status),
    metrics: coerceMetrics(row.metrics),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    kind: row.kind === "device" ? "device" : "sim",
    deviceLabel: row.device_label ?? null,
    lastSeenAt: row.last_seen_at ? Date.parse(row.last_seen_at) : null,
    device: {
      socTemp: row.metrics?.socTemp ?? null,
      battery: row.metrics?.battery ?? null,
      charging: row.metrics?.charging ?? null,
      tempSource: row.metrics?.tempSource ?? null,
      loadSource: row.metrics?.loadSource ?? null,
      bounds: row.metrics?.bounds ?? null,
      tempGates: row.metrics?.tempGates ?? null,
    },
  };
}

export function metricsToPoint(m: NodeMetrics): TelemetryPoint {
  return {
    ts: m.ts,
    load: m.load,
    temp: m.temp,
    throughput: m.throughput,
    power: m.power,
    mem: m.mem,
    fanRpm: m.fanRpm,
  };
}

export function telemetryToPoint(row: TelemetryRow): TelemetryPoint {
  return {
    ts: Number(row.ts),
    load: Number(row.load ?? 0),
    temp: Number(row.temp ?? 0),
    throughput: Number(row.throughput ?? 0),
    power: Number(row.power ?? 0),
    mem: Number(row.mem ?? 0),
    fanRpm: Number(row.fan_rpm ?? 0),
  };
}
