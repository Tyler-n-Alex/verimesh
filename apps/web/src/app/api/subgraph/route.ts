import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { ALLOWED_QUERIES } from "@/lib/subgraphQueries";

export const dynamic = "force-dynamic";

const UPSTREAM =
  process.env.SUBGRAPH_URL ?? process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "";

const TTL_MS = Number(process.env.SUBGRAPH_CACHE_TTL_MS ?? 60_000);
const STALE_MS = Number(process.env.SUBGRAPH_STALE_TTL_MS ?? 3_600_000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.SUBGRAPH_TIMEOUT_MS ?? 12_000);
const MAX_ENTRIES = 200;

interface Entry {
  data: unknown;
  storedAt: number;
}

const lastGood = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

let blockedUntil = 0;

class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("subgraph rate limit reached");
    this.retryAfterMs = retryAfterMs;
  }
}

function stableKey(query: string, variables: Record<string, unknown>): string {
  const sorted = Object.keys(variables)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = variables[k];
      return acc;
    }, {});
  return `${query.trim()}|${JSON.stringify(sorted)}`;
}

function remember(key: string, data: unknown): void {
  if (lastGood.size >= MAX_ENTRIES) {
    const oldest = [...lastGood.entries()].sort(
      (a, b) => a[1].storedAt - b[1].storedAt
    )[0];
    if (oldest) lastGood.delete(oldest[0]);
  }
  lastGood.set(key, { data, storedAt: Date.now() });
}

async function fetchUpstream(
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (res.status === 429) {
    const header = Number(res.headers.get("retry-after") ?? 0);
    throw new RateLimitedError(
      Number.isFinite(header) && header > 0 ? header * 1000 : 60_000
    );
  }

  if (!res.ok) {
    throw new Error(`subgraph HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    data?: unknown;
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }

  return body.data ?? null;
}

function cachedUpstream(
  key: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  return unstable_cache(
    () => fetchUpstream(query, variables),
    ["subgraph", key],
    { revalidate: Math.max(1, Math.floor(TTL_MS / 1000)) }
  )();
}

export async function POST(request: Request) {
  if (!UPSTREAM) {
    return NextResponse.json({
      data: null,
      error: "SUBGRAPH_URL is not set on the server",
      configured: false,
      stale: false,
      ageMs: 0,
    });
  }

  let payload: { query?: unknown; variables?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const query = typeof payload.query === "string" ? payload.query : "";
  const variables =
    payload.variables && typeof payload.variables === "object"
      ? (payload.variables as Record<string, unknown>)
      : {};

  if (!ALLOWED_QUERIES.has(query.trim())) {
    return NextResponse.json(
      { error: "query is not on the server allowlist" },
      { status: 400 }
    );
  }

  const key = stableKey(query, variables);
  const cached = lastGood.get(key);
  const now = Date.now();

  if (cached && now - cached.storedAt < TTL_MS) {
    return NextResponse.json({
      data: cached.data,
      error: null,
      configured: true,
      stale: false,
      ageMs: now - cached.storedAt,
    });
  }

  if (blockedUntil > now) {
    return serveStale(cached, "subgraph rate limit reached", blockedUntil - now);
  }

  try {
    let pending = inflight.get(key);
    if (!pending) {
      pending = cachedUpstream(key, query, variables).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, pending);
    }

    const data = await pending;
    remember(key, data);

    return NextResponse.json({
      data,
      error: null,
      configured: true,
      stale: false,
      ageMs: 0,
    });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      blockedUntil = Date.now() + err.retryAfterMs;
      return serveStale(cached, err.message, err.retryAfterMs);
    }
    const message = err instanceof Error ? err.message : String(err);
    return serveStale(cached, message, 0);
  }
}

function serveStale(
  cached: Entry | undefined,
  error: string,
  retryAfterMs: number
) {
  if (cached && Date.now() - cached.storedAt < STALE_MS) {
    return NextResponse.json({
      data: cached.data,
      error,
      configured: true,
      stale: true,
      ageMs: Date.now() - cached.storedAt,
      retryAfterMs,
    });
  }

  return NextResponse.json(
    {
      data: null,
      error,
      configured: true,
      stale: false,
      ageMs: 0,
      retryAfterMs,
    },
    { status: 503 }
  );
}
