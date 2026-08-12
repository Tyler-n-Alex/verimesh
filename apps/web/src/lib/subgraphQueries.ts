export type Source = "live" | "fixture";

export interface SubgraphDecision {
  id: string;
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  authTier: number;
  humanAuthorized: boolean;
  zerogRoot: string | null;
  ts: string;
  txHash: string;
}

export interface SubgraphFreeze {
  id: string;
  decisionId: string;
  nodeId: string;
  operator: string;
  reason: string;
  requiredTier: number;
  requiredQuorum: number;
  ts: string;
  txHash: string;
}

export interface SubgraphApproval {
  id: string;
  decisionId: string;
  worldIdNullifier: string;
  operator: string;
  approvalIndex: number;
  ts: string;
  txHash: string;
}

export interface SubgraphOverride {
  id: string;
  decisionId: string;
  chosenAction: string;
  approvalsCollected: number;
  ts: string;
  txHash: string;
}

export interface SubgraphHumanAuthority {
  id: string;
  worldIdNullifier: string;
  overrideCount: number;
  lastOverrideTs: string;
  operators: string[];
}

export interface SubgraphNodeHistory {
  id: string;
  nodeId: string;
  operator: string;
  incidentCount: number;
  violationCount: number;
  lastIncidentTs: string;
}

export const HISTORY_QUERY = `
query NodeHistory($nodeId: String!, $first: Int = 10) {
  decisions(
    where: { nodeId: $nodeId }
    orderBy: ts
    orderDirection: desc
    first: $first
  ) {
    id
    nodeId
    operator
    action
    verdict
    authTier
    humanAuthorized
    ts
    txHash
  }
  nodeHistories(where: { nodeId: $nodeId }) {
    id
    nodeId
    operator
    incidentCount
    violationCount
    lastIncidentTs
  }
}
`;

export const OPERATOR_DECISIONS_QUERY = `
query OperatorDecisions($operator: String!, $first: Int = 50) {
  decisions(
    where: { operator: $operator }
    orderBy: ts
    orderDirection: desc
    first: $first
  ) {
    id
    nodeId
    operator
    action
    verdict
    authTier
    humanAuthorized
    zerogRoot
    ts
    txHash
  }
}
`;

export const NODE_TIMELINE_QUERY = `
query NodeTimeline($nodeId: String!, $first: Int = 40) {
  decisions(
    where: { nodeId: $nodeId }
    orderBy: ts
    orderDirection: desc
    first: $first
  ) {
    id
    action
    verdict
    authTier
    humanAuthorized
    ts
    txHash
  }
  freezes(
    where: { nodeId: $nodeId }
    orderBy: ts
    orderDirection: desc
    first: $first
  ) {
    id
    decisionId
    reason
    requiredTier
    requiredQuorum
    ts
    txHash
  }
  nodeHistories(where: { nodeId: $nodeId }) {
    incidentCount
    violationCount
    lastIncidentTs
  }
}
`;

export const DECISION_AUDIT_QUERY = `
query DecisionAudit($decisionId: Bytes!) {
  decisions(where: { id: $decisionId }) {
    id
    nodeId
    operator
    action
    verdict
    authTier
    humanAuthorized
    zerogRoot
    ts
    txHash
  }
  freezes(where: { decisionId: $decisionId }) {
    reason
    requiredTier
    requiredQuorum
    ts
    txHash
  }
  approvals(
    where: { decisionId: $decisionId }
    orderBy: approvalIndex
    orderDirection: asc
  ) {
    id
    worldIdNullifier
    operator
    approvalIndex
    ts
    txHash
  }
  overrides(where: { decisionId: $decisionId }) {
    chosenAction
    approvalsCollected
    ts
    txHash
  }
}
`;

export const AUTHZ_LEDGER_QUERY = `
query AuthzLedger($first: Int = 50) {
  approvals(orderBy: ts, orderDirection: desc, first: $first) {
    id
    decisionId
    worldIdNullifier
    operator
    approvalIndex
    ts
    txHash
  }
  humanAuthorities(orderBy: lastOverrideTs, orderDirection: desc, first: $first) {
    id
    worldIdNullifier
    overrideCount
    lastOverrideTs
    operators
  }
  overrides(orderBy: ts, orderDirection: desc, first: $first) {
    id
    decisionId
    chosenAction
    approvalsCollected
    ts
    txHash
  }
}
`;

export const ALLOWED_QUERIES: ReadonlySet<string> = new Set(
  [
    HISTORY_QUERY,
    OPERATOR_DECISIONS_QUERY,
    NODE_TIMELINE_QUERY,
    DECISION_AUDIT_QUERY,
    AUTHZ_LEDGER_QUERY,
  ].map((q) => q.trim())
);

export function interpolate(
  query: string,
  variables: Record<string, unknown>
): string {
  const header = Object.keys(variables).length
    ? `# variables: ${JSON.stringify(variables)}\n`
    : "";
  return `${header}${query.trim()}`;
}
