export const ZEROG_EXPLORER =
  process.env.NEXT_PUBLIC_ZEROG_EXPLORER ?? "https://storagescan-galileo.0g.ai";

export function zerogBlobUrl(root: string): string {
  return `/api/zerog/blob?root=${encodeURIComponent(root)}`;
}

export function zerogExplorerUrl(root: string): string {
  return `${ZEROG_EXPLORER}/file/${root}`;
}

export interface ReasoningBlob {
  version: 1;
  decision: {
    proposalId: number;
    nodeId: string | null;
    operator: string | null;
    ts: number;
  };
  telemetry: unknown;
  citedHistory: unknown;
  proposal: unknown;
  verdict: unknown;
  authorization: {
    tier: string | null;
    requiredQuorum: number | null;
    operatorsRequired: string[];
    reason: string | null;
    approvals: { nullifier: string; operator: string; ts: number }[];
  };
}
