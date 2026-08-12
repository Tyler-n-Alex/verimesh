"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gql, type GqlResult } from "@/lib/subgraph";
import { useSubgraphHealth } from "@/store/subgraph";

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
        useSubgraphHealth.getState().report({
          source: next.source,
          error: next.error,
          ms: next.ms,
          endpoint: next.endpoint,
          stale: next.stale,
          ageMs: next.ageMs,
        });
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

    let timer: number | undefined;

    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(refetch, pollMs);
    };

    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetch();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pollMs, skip, refetch]);

  return { result, loading, refetch };
}
