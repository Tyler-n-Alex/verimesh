export type NodeStatus =
  | "healthy"
  | "warning"
  | "violation"
  | "awaiting_human"
  | "isolated"
  | "offline";

export interface NodeMetrics {
  ts: number;
  load: number;
  temp: number;
  throughput: number;
  power: number;
  mem: number;
  fanRpm: number;
}

export interface GridNode {
  id: string;
  name: string;
  operator: string;
  pos: [number, number, number];
  status: NodeStatus;
  metrics: NodeMetrics;
}

export interface Edge {
  from: string;
  to: string;
  weight: number;
}

export type GridState = {
  nodes: GridNode[];
  edges: Edge[];
};

export const ACTIONS = [
  "REBALANCE_LOAD",
  "THROTTLE_NODE",
  "ISOLATE_NODE",
  "SCALE_UP",
  "NO_OP",
  "ESCALATE_TO_HUMAN",
] as const;

export type Action = (typeof ACTIONS)[number];

export interface Proposal {
  diagnosis: string;
  proposed_action: Action;
  target_nodes: string[];
  expected_effect: string;
  confidence: number;
  risk_flags: string[];
}

export type Verdict = "VERIFIED" | "VIOLATION_TRIGGERED" | "ESCALATE";

export interface Violation {
  node: string;
  metric: string;
  value: number;
  bound: number;
}

export interface VerdictResult {
  verdict: Verdict;
  detail: string;
  violated?: Violation;
  projected: Record<string, NodeMetrics>;
}

export type VerifyConstraints = (
  state: GridState,
  action: Proposal
) => VerdictResult;

export interface DecisionRecord {
  id: string;
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  humanAuthorized: boolean;
  worldIdNullifier?: string;
  zerogRoot?: string;
  chainTxHash?: string;
  ts: number;
}

export interface HistoryEntry {
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  outcome: string;
  ts: number;
}
