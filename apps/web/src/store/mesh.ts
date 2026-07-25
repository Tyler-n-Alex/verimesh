"use client";

import { create } from "zustand";
import type { NodeStatus } from "@verimesh/shared";
import type {
  ApprovalRow,
  CommitRow,
  EdgeRow,
  EventRow,
  GateRow,
  MeshNode,
  NodeRow,
  ProposalRow,
  TelemetryPoint,
  TelemetryRow,
  VerdictRow,
} from "@/lib/db";
import { mapNode, metricsToPoint, telemetryToPoint } from "@/lib/db";

export type LinkState = "connecting" | "live" | "error" | "idle";

export const EVENT_CAP = 400;
export const PROPOSAL_CAP = 60;
export const TELEMETRY_CAP = 120;

export interface MeshEdge {
  id: number;
  from: string;
  to: string;
  weight: number;
  crossOperator: boolean;
}

export type AuditTarget =
  | { kind: "proposal"; proposalId: number }
  | { kind: "decision"; decisionId: string };

export interface MeshState {
  link: LinkState;
  linkError: string | null;
  hydrated: boolean;

  nodes: Record<string, MeshNode>;
  nodeIds: string[];
  edges: MeshEdge[];

  events: EventRow[];
  proposals: ProposalRow[];
  verdicts: Record<number, VerdictRow>;
  commits: Record<number, CommitRow>;
  gates: GateRow[];
  approvals: Record<number, ApprovalRow[]>;
  telemetry: Record<string, TelemetryPoint[]>;

  selectedNodeId: string | null;
  activeGateId: number | null;
  auditTarget: AuditTarget | null;

  setLink: (link: LinkState, error?: string | null) => void;
  hydrate: (payload: {
    nodes: NodeRow[];
    edges: EdgeRow[];
    events: EventRow[];
    proposals: ProposalRow[];
    verdicts: VerdictRow[];
    commits: CommitRow[];
    gates: GateRow[];
    approvals: ApprovalRow[];
    telemetry: TelemetryRow[];
  }) => void;

  upsertNode: (row: NodeRow) => void;
  removeNode: (id: string) => void;
  setEdges: (rows: EdgeRow[]) => void;
  pushEvent: (row: EventRow) => void;
  upsertProposal: (row: ProposalRow) => void;
  upsertVerdict: (row: VerdictRow) => void;
  upsertCommit: (row: CommitRow) => void;
  setCommits: (rows: CommitRow[]) => void;
  upsertGate: (row: GateRow) => void;
  upsertApproval: (row: ApprovalRow) => void;

  selectNode: (id: string | null) => void;
  openGate: (id: number | null) => void;
  openAudit: (target: AuditTarget | null) => void;
}

function byTsDesc<T extends { ts: number; id: number }>(a: T, b: T): number {
  if (b.ts !== a.ts) return b.ts - a.ts;
  return b.id - a.id;
}

function insertSorted<T extends { ts: number; id: number }>(
  list: T[],
  row: T,
  cap: number
): T[] {
  const existing = list.findIndex((r) => r.id === row.id);
  const next = existing >= 0 ? list.slice() : [row, ...list];
  if (existing >= 0) next[existing] = row;
  next.sort(byTsDesc);
  return next.length > cap ? next.slice(0, cap) : next;
}

function appendTelemetry(
  bucket: TelemetryPoint[] | undefined,
  point: TelemetryPoint
): TelemetryPoint[] {
  const list = bucket ?? [];
  const last = list[list.length - 1];
  if (last && last.ts === point.ts) return list;
  const next = list.length >= TELEMETRY_CAP ? list.slice(1) : list.slice();
  next.push(point);
  return next;
}

export const useMeshStore = create<MeshState>((set) => ({
  link: "idle",
  linkError: null,
  hydrated: false,

  nodes: {},
  nodeIds: [],
  edges: [],

  events: [],
  proposals: [],
  verdicts: {},
  commits: {},
  gates: [],
  approvals: {},
  telemetry: {},

  selectedNodeId: null,
  activeGateId: null,
  auditTarget: null,

  setLink: (link, error = null) => set({ link, linkError: error }),

  hydrate: (payload) =>
    set(() => {
      const nodes: Record<string, MeshNode> = {};
      for (const row of payload.nodes) nodes[row.id] = mapNode(row);
      const nodeIds = Object.keys(nodes).sort();

      const telemetry: Record<string, TelemetryPoint[]> = {};
      const ordered = payload.telemetry
        .slice()
        .sort((a, b) => Number(a.ts) - Number(b.ts));
      for (const row of ordered) {
        const bucket = telemetry[row.node_id] ?? [];
        if (bucket.length >= TELEMETRY_CAP) bucket.shift();
        bucket.push(telemetryToPoint(row));
        telemetry[row.node_id] = bucket;
      }
      for (const id of nodeIds) {
        telemetry[id] = appendTelemetry(
          telemetry[id],
          metricsToPoint(nodes[id].metrics)
        );
      }

      const verdicts: Record<number, VerdictRow> = {};
      for (const row of payload.verdicts) verdicts[row.proposal_id] = row;

      const commits: Record<number, CommitRow> = {};
      for (const row of payload.commits) commits[row.proposal_id] = row;

      const approvals: Record<number, ApprovalRow[]> = {};
      for (const row of payload.approvals) {
        approvals[row.gate_id] = [...(approvals[row.gate_id] ?? []), row];
      }

      const gates = payload.gates.slice().sort(byTsDesc);
      const pending = gates.find((g) => g.status === "pending");

      return {
        hydrated: true,
        nodes,
        nodeIds,
        edges: mapEdges(payload.edges, nodes),
        events: payload.events.slice().sort(byTsDesc).slice(0, EVENT_CAP),
        proposals: payload.proposals.slice().sort(byTsDesc).slice(0, PROPOSAL_CAP),
        verdicts,
        commits,
        gates,
        approvals,
        telemetry,
        activeGateId: pending ? pending.id : null,
      };
    }),

  upsertNode: (row) =>
    set((state) => {
      const node = mapNode(row);
      const nodes = { ...state.nodes, [node.id]: node };
      const isNew = state.nodes[node.id] === undefined;
      const nodeIds = isNew ? Object.keys(nodes).sort() : state.nodeIds;
      return {
        nodes,
        nodeIds,
        edges: isNew ? remapEdges(state.edges, nodes) : state.edges,
        telemetry: {
          ...state.telemetry,
          [node.id]: appendTelemetry(
            state.telemetry[node.id],
            metricsToPoint(node.metrics)
          ),
        },
      };
    }),

  removeNode: (id) =>
    set((state) => {
      if (!state.nodes[id]) return state;
      const nodes = { ...state.nodes };
      delete nodes[id];
      return {
        nodes,
        nodeIds: Object.keys(nodes).sort(),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
    }),

  setEdges: (rows) =>
    set((state) => ({ edges: mapEdges(rows, state.nodes) })),

  pushEvent: (row) =>
    set((state) => ({ events: insertSorted(state.events, row, EVENT_CAP) })),

  upsertProposal: (row) =>
    set((state) => ({
      proposals: insertSorted(state.proposals, row, PROPOSAL_CAP),
    })),

  upsertVerdict: (row) =>
    set((state) => ({
      verdicts: { ...state.verdicts, [row.proposal_id]: row },
    })),

  upsertCommit: (row) =>
    set((state) => ({ commits: { ...state.commits, [row.proposal_id]: row } })),

  setCommits: (rows) =>
    set(() => {
      const commits: Record<number, CommitRow> = {};
      for (const row of rows) commits[row.proposal_id] = row;
      return { commits };
    }),

  upsertGate: (row) =>
    set((state) => {
      const gates = insertSorted(state.gates, row, 40);
      const pending = gates.find((g) => g.status === "pending");
      const activeGateId = pending
        ? pending.id
        : state.activeGateId === row.id && row.status !== "pending"
          ? null
          : state.activeGateId;
      return { gates, activeGateId };
    }),

  upsertApproval: (row) =>
    set((state) => {
      const bucket = state.approvals[row.gate_id] ?? [];
      const idx = bucket.findIndex((r) => r.id === row.id);
      const next = idx >= 0 ? bucket.slice() : [...bucket, row];
      if (idx >= 0) next[idx] = row;
      next.sort((a, b) => a.ts - b.ts);
      return { approvals: { ...state.approvals, [row.gate_id]: next } };
    }),

  selectNode: (id) => set({ selectedNodeId: id }),
  openGate: (id) => set({ activeGateId: id }),
  openAudit: (target) => set({ auditTarget: target }),
}));

function mapEdges(rows: EdgeRow[], nodes: Record<string, MeshNode>): MeshEdge[] {
  return rows.map((row) => ({
    id: row.id,
    from: row.from_node,
    to: row.to_node,
    weight: Number(row.weight),
    crossOperator: isCrossOperator(row.from_node, row.to_node, nodes),
  }));
}

function remapEdges(
  edges: MeshEdge[],
  nodes: Record<string, MeshNode>
): MeshEdge[] {
  return edges.map((edge) => ({
    ...edge,
    crossOperator: isCrossOperator(edge.from, edge.to, nodes),
  }));
}

function isCrossOperator(
  from: string,
  to: string,
  nodes: Record<string, MeshNode>
): boolean {
  const a = nodes[from];
  const b = nodes[to];
  if (!a || !b) return false;
  return a.operator !== b.operator;
}

export function statusCounts(
  nodes: Record<string, MeshNode>
): Partial<Record<NodeStatus, number>> {
  const counts: Partial<Record<NodeStatus, number>> = {};
  for (const node of Object.values(nodes)) {
    counts[node.status] = (counts[node.status] ?? 0) + 1;
  }
  return counts;
}

export function operatorCounts(
  nodes: Record<string, MeshNode>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of Object.values(nodes)) {
    counts[node.operator] = (counts[node.operator] ?? 0) + 1;
  }
  return counts;
}
