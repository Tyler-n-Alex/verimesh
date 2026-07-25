import type { HistoryEntry } from "@verimesh/shared";
import { withRetry } from "./retry";

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

export interface NodeHistoryStats {
  incidentCount: number;
  violationCount: number;
  lastIncidentTs: string;
}

export interface HistoryResult {
  decisions: SubgraphDecision[];
  nodeHistory: NodeHistoryStats | null;
}

export interface AuthzQueryResult {
  incidentCount: number;
  overrideCounts: Record<string, number>;
}

const GET_HISTORY_QUERY = `
query GetHistory($nodeId: String!, $operator: String!, $first: Int = 10) {
  decisions(
    where: { nodeId: $nodeId, operator: $operator }
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
  nodeHistories(where: { nodeId: $nodeId }) {
    incidentCount
    violationCount
    lastIncidentTs
  }
}
`;

const AUTHZ_QUERY = `
query AuthzContext($nodeId: String!, $nullifiers: [Bytes!]!) {
  nodeHistories(where: { nodeId: $nodeId }) {
    incidentCount
  }
  humanAuthorities(where: { worldIdNullifier_in: $nullifiers }) {
    worldIdNullifier
    overrideCount
  }
}
`;

export async function gqlFetch<T>(
  url: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
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
      if (!body.data) {
        throw new Error("subgraph returned no data");
      }
      return body.data;
    },
    { label: "subgraph", attempts: 3, timeoutMs: 15_000 }
  );
}

export async function getHistory(
  url: string,
  nodeId: string,
  operator: string,
  first = 10
): Promise<HistoryResult> {
  const data = await gqlFetch<{
    decisions: SubgraphDecision[];
    nodeHistories: NodeHistoryStats[];
  }>(url, GET_HISTORY_QUERY, { nodeId, operator, first });

  return {
    decisions: data.decisions ?? [],
    nodeHistory: data.nodeHistories?.[0] ?? null,
  };
}

export function toHistoryEntries(result: HistoryResult): HistoryEntry[] {
  return result.decisions.map((d) => ({
    nodeId: d.nodeId,
    operator: d.operator,
    action: d.action,
    verdict: d.verdict,
    outcome: d.humanAuthorized ? "human_authorized" : "autonomous",
    ts: Number(d.ts),
  }));
}

export async function fetchAuthzContext(
  url: string,
  nodeId: string,
  nullifiers: string[]
): Promise<AuthzQueryResult> {
  const data = await gqlFetch<{
    nodeHistories: { incidentCount: number }[];
    humanAuthorities: { worldIdNullifier: string; overrideCount: number }[];
  }>(url, AUTHZ_QUERY, { nodeId, nullifiers });

  const overrideCounts: Record<string, number> = {};
  for (const row of data.humanAuthorities ?? []) {
    overrideCounts[row.worldIdNullifier] = row.overrideCount;
  }

  return {
    incidentCount: data.nodeHistories?.[0]?.incidentCount ?? 0,
    overrideCounts,
  };
}
