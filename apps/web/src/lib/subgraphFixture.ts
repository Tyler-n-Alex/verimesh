import type {
  SubgraphApproval,
  SubgraphDecision,
  SubgraphFreeze,
  SubgraphHumanAuthority,
  SubgraphNodeHistory,
  SubgraphOverride,
} from "@/lib/subgraph";

const HOUR = 3_600_000;
const BASE_TS = 1_784_900_000_000;

const NULLIFIER_A =
  "0x0000000000000000000000000000000000000000000000000000000000a11ce0";
const NULLIFIER_B =
  "0x0000000000000000000000000000000000000000000000000000000000b0b1e0";

function tx(seed: number): string {
  return `0x${seed.toString(16).padStart(8, "0").repeat(8).slice(0, 64)}`;
}

function decisionId(seed: number): string {
  return `0x${(seed * 7919).toString(16).padStart(6, "0").repeat(11).slice(0, 64)}`;
}

const NODE_OPERATORS: Record<string, string> = {
  "node-00": "opC",
  "node-01": "opA",
  "node-02": "opA",
  "node-03": "opA",
  "node-04": "opB",
  "node-05": "opB",
  "node-06": "opB",
  "node-07": "opA",
  "node-08": "opA",
  "node-09": "opA",
  "node-10": "opB",
  "node-11": "opB",
  "node-12": "opB",
  "node-13": "opC",
  "node-14": "opC",
  "node-15": "opC",
};

interface Seed {
  nodeId: string;
  action: string;
  verdict: string;
  authTier: number;
  humanAuthorized: boolean;
  hoursAgo: number;
}

const SEEDS: Seed[] = [
  { nodeId: "node-07", action: "THROTTLE_NODE", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 26 },
  { nodeId: "node-07", action: "THROTTLE_NODE", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 14 },
  { nodeId: "node-07", action: "ISOLATE_NODE", verdict: "VIOLATION_TRIGGERED", authTier: 2, humanAuthorized: true, hoursAgo: 6 },
  { nodeId: "node-12", action: "REBALANCE_LOAD", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 21 },
  { nodeId: "node-12", action: "THROTTLE_NODE", verdict: "ESCALATE", authTier: 1, humanAuthorized: true, hoursAgo: 9 },
  { nodeId: "node-05", action: "SCALE_UP", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 18 },
  { nodeId: "node-02", action: "REBALANCE_LOAD", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 12 },
  { nodeId: "node-14", action: "ISOLATE_NODE", verdict: "VIOLATION_TRIGGERED", authTier: 1, humanAuthorized: true, hoursAgo: 4 },
  { nodeId: "node-09", action: "NO_OP", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 3 },
  { nodeId: "node-10", action: "THROTTLE_NODE", verdict: "VERIFIED", authTier: 0, humanAuthorized: false, hoursAgo: 2 },
];

export const FIXTURE_DECISIONS: SubgraphDecision[] = SEEDS.map((seed, i) => ({
  id: decisionId(i + 1),
  nodeId: seed.nodeId,
  operator: NODE_OPERATORS[seed.nodeId] ?? "opA",
  action: seed.action,
  verdict: seed.verdict,
  authTier: seed.authTier,
  humanAuthorized: seed.humanAuthorized,
  zerogRoot: `0x${(i + 41).toString(16).padStart(4, "0").repeat(16).slice(0, 64)}`,
  ts: String(Math.floor((BASE_TS - seed.hoursAgo * HOUR) / 1000)),
  txHash: tx(i + 1),
})).sort((a, b) => Number(b.ts) - Number(a.ts));

export const FIXTURE_FREEZES: SubgraphFreeze[] = FIXTURE_DECISIONS.filter(
  (d) => d.verdict !== "VERIFIED"
).map((d) => ({
  id: `${d.id}-freeze`,
  decisionId: d.id,
  nodeId: d.nodeId,
  operator: d.operator,
  reason:
    d.authTier === 2
      ? `isolating ${d.operator}'s ${d.nodeId} would breach opB's node-12 throughput floor`
      : `${d.action} on ${d.nodeId} is a high-privilege action confined to ${d.operator}`,
  requiredTier: d.authTier,
  requiredQuorum: d.authTier === 2 ? 2 : 1,
  ts: d.ts,
  txHash: d.txHash,
}));

export const FIXTURE_APPROVALS: SubgraphApproval[] = FIXTURE_DECISIONS.filter(
  (d) => d.humanAuthorized
).flatMap((d) => {
  const signers =
    d.authTier === 2
      ? [
          { nullifier: NULLIFIER_A, operator: "opA" },
          { nullifier: NULLIFIER_B, operator: "opB" },
        ]
      : [{ nullifier: d.operator === "opB" ? NULLIFIER_B : NULLIFIER_A, operator: d.operator }];

  return signers.map((signer, index) => ({
    id: `${d.id}-approval-${index}`,
    decisionId: d.id,
    worldIdNullifier: signer.nullifier,
    operator: signer.operator,
    approvalIndex: index,
    ts: String(Number(d.ts) + index * 11),
    txHash: d.txHash,
  }));
});

export const FIXTURE_OVERRIDES: SubgraphOverride[] = FIXTURE_DECISIONS.filter(
  (d) => d.humanAuthorized
).map((d) => ({
  id: `${d.id}-override`,
  decisionId: d.id,
  chosenAction: d.action,
  approvalsCollected: d.authTier === 2 ? 2 : 1,
  ts: String(Number(d.ts) + 30),
  txHash: d.txHash,
}));

export const FIXTURE_AUTHORITIES: SubgraphHumanAuthority[] = [
  {
    id: NULLIFIER_A,
    worldIdNullifier: NULLIFIER_A,
    overrideCount: 2,
    lastOverrideTs: FIXTURE_DECISIONS[0]?.ts ?? String(BASE_TS / 1000),
    operators: ["opA"],
  },
  {
    id: NULLIFIER_B,
    worldIdNullifier: NULLIFIER_B,
    overrideCount: 1,
    lastOverrideTs: FIXTURE_DECISIONS[1]?.ts ?? String(BASE_TS / 1000),
    operators: ["opB"],
  },
];

export function fixtureNodeHistories(nodeId: string): SubgraphNodeHistory[] {
  const forNode = FIXTURE_DECISIONS.filter((d) => d.nodeId === nodeId);
  if (forNode.length === 0) return [];
  return [
    {
      id: nodeId,
      nodeId,
      operator: forNode[0].operator,
      incidentCount: forNode.length,
      violationCount: forNode.filter((d) => d.verdict !== "VERIFIED").length,
      lastIncidentTs: forNode[0].ts,
    },
  ];
}

export function fixtureDecisionsByOperator(operator: string): SubgraphDecision[] {
  return FIXTURE_DECISIONS.filter((d) => d.operator === operator);
}

export function fixtureDecisionsByNode(nodeId: string): SubgraphDecision[] {
  return FIXTURE_DECISIONS.filter((d) => d.nodeId === nodeId);
}

export function fixtureFreezesByNode(nodeId: string): SubgraphFreeze[] {
  return FIXTURE_FREEZES.filter((f) => f.nodeId === nodeId);
}

export function fixtureDecisionById(id: string): SubgraphDecision | null {
  return FIXTURE_DECISIONS.find((d) => d.id === id) ?? null;
}

export function fixtureApprovalsFor(decisionId: string): SubgraphApproval[] {
  return FIXTURE_APPROVALS.filter((a) => a.decisionId === decisionId);
}

export function fixtureFreezeFor(decisionId: string): SubgraphFreeze[] {
  return FIXTURE_FREEZES.filter((f) => f.decisionId === decisionId);
}

export function fixtureOverrideFor(decisionId: string): SubgraphOverride[] {
  return FIXTURE_OVERRIDES.filter((o) => o.decisionId === decisionId);
}
