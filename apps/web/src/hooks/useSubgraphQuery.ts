"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gql, type GqlResult } from "@/lib/subgraph";

export interface SubgraphQueryState<T> {
  result: GqlResult<T> | null;
  loading: boolean;
  refetch: () => void;
}

export function useSubgraphQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  fixture: () => T,
  options: { skip?: boolean; pollMs?: number } = {}
): SubgraphQueryState<T> {
  const { skip = false, pollMs } = options;
  const [result, setResult] = useState<GqlResult<T> | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [nonce, setNonce] = useState(0);

  const fixtureRef = useRef(fixture);
  fixtureRef.current = fixture;

  const key = `${query}|${JSON.stringify(variables)}`;

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    gql<T>(query, variables, () => fixtureRef.current())
      .then((next) => {
        if (cancelled) return;
        setResult(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip, nonce]);

  useEffect(() => {
    if (!pollMs || skip) return;
    const timer = window.setInterval(refetch, pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, skip, refetch]);

  return { result, loading, refetch };
}
