export * from "@/lib/subgraphQueries";

import { interpolate, type Source } from "@/lib/subgraphQueries";

const PROXY_ENDPOINT = "/api/subgraph";

export const subgraphConfigured =
  (process.env.NEXT_PUBLIC_SUBGRAPH_ENABLED ?? "").toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "").length > 0;

export const REGISTRY_EXPLORER =
  process.env.NEXT_PUBLIC_REGISTRY_EXPLORER ?? "https://sepolia.basescan.org";
export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "";

export interface GqlResult<T> {
  data: T | null;
  source: Source;
  error: string | null;
  queryText: string;
  variables: Record<string, unknown>;
  endpoint: string;
  ms: number;
  stale: boolean;
  ageMs: number;
}

interface ProxyResponse<T> {
  data: T | null;
  error: string | null;
  configured: boolean;
  stale: boolean;
  ageMs: number;
  retryAfterMs?: number;
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
        : "the subgraph is not configured and no fixture is available",
      queryText,
      variables,
      endpoint: "(fixture — subgraph disabled)",
      ms: 0,
      stale: false,
      ageMs: 0,
    };
  }

  try {
    const res = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });

    const body = (await res.json()) as ProxyResponse<T>;

    if (body.data !== null && body.data !== undefined) {
      return {
        data: body.data,
        source: "live",
        error: body.stale ? body.error : null,
        queryText,
        variables,
        endpoint: PROXY_ENDPOINT,
        ms: Date.now() - started,
        stale: body.stale,
        ageMs: body.ageMs,
      };
    }

    throw new Error(body.error ?? `subgraph proxy HTTP ${res.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: fixture ? fixture() : null,
      source: "fixture",
      error: message,
      queryText,
      variables,
      endpoint: PROXY_ENDPOINT,
      ms: Date.now() - started,
      stale: false,
      ageMs: 0,
    };
  }
}
