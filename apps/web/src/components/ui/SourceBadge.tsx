"use client";

import { Pill } from "@/components/ui/Pill";
import type { GqlResult } from "@/lib/subgraph";

export function SourceBadge({
  result,
  loading,
}: {
  result: GqlResult<unknown> | null;
  loading: boolean;
}) {
  if (loading && !result) {
    return (
      <Pill color="#22d3ee" pulse>
        querying
      </Pill>
    );
  }
  if (!result) return null;

  if (result.source === "live") {
    return (
      <Pill color="#34d399" title={result.endpoint}>
        subgraph · {result.ms}ms
      </Pill>
    );
  }

  return (
    <Pill
      color="#fbbf24"
      title={
        result.error
          ? `subgraph unavailable: ${result.error}`
          : "SUBGRAPH_URL is not set — showing a fixture shaped exactly like schema.graphql"
      }
    >
      fixture
    </Pill>
  );
}

export function QueryFooter({ result }: { result: GqlResult<unknown> | null }) {
  if (!result) return null;
  return (
    <div className="flex flex-col gap-0.5 border-t border-hairline bg-abyss px-3 py-1.5">
      <span className="data truncate text-[9px] text-ink-faint">
        {result.endpoint}
      </span>
      {result.error ? (
        <span className="data text-[9px]" style={{ color: "#fbbf24" }}>
          {result.error}
        </span>
      ) : null}
    </div>
  );
}
