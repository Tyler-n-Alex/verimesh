export const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "";
export const subgraphConfigured = SUBGRAPH_URL.length > 0;

export const REGISTRY_EXPLORER =
  process.env.NEXT_PUBLIC_REGISTRY_EXPLORER ?? "https://sepolia.basescan.org";
export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "";

export type Source = "live" | "fixture";

export interface GqlResult<T> {
  data: T | null;
  source: Source;
  error: string | null;
  queryText: string;
  variables: Record<string, unknown>;
  endpoint: string;
  ms: number;
}

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

export function interpolate(
  query: string,
  variables: Record<string, unknown>
): string {
  const header = Object.keys(variables).length
    ? `# variables: ${JSON.stringify(variables)}\n`
    : "";
  return `${header}${query.trim()}`;
}

export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  fixture?: () => T
): Promise<GqlResult<T>> {
  const queryText = interpolate(query, variables);
  const started = Date.now();

  if (!subgraphConfigured) {
    return {
      data: fixture ? fixture() : null,
      source: "fixture",
      error: fixture
        ? null
        : "NEXT_PUBLIC_SUBGRAPH_URL is not set and no fixture is available",
      queryText,
      variables,
      endpoint: "(fixture — SUBGRAPH_URL unset)",
      ms: 0,
    };
  }

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });

    const body = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };

    if (!res.ok) {
      throw new Error(`subgraph HTTP ${res.status}`);
    }
    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }

    return {
      data: body.data ?? null,
      source: "live",
      error: null,
      queryText,
      variables,
      endpoint: SUBGRAPH_URL,
      ms: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: fixture ? fixture() : null,
      source: "fixture",
      error: message,
      queryText,
      variables,
      endpoint: SUBGRAPH_URL,
      ms: Date.now() - started,
    };
  }
}
