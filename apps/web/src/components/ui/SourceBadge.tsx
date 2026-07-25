"use client";

import { Badge } from "@/components/ui/Pill";
import { ACCENT } from "@/lib/palette";
import type { GqlResult } from "@/lib/subgraph";

export function SourceBadge({
  result,
  loading,
}: {
  result: GqlResult<unknown> | null;
  loading: boolean;
}) {
  if (loading && !result) {
    return <Badge glyph="◌">Querying</Badge>;
  }
  if (!result) return null;

  if (result.source === "live") {
    return (
      <Badge tone={ACCENT} severity="notice" glyph="◉" title={result.endpoint}>
        Subgraph · {result.ms}ms
      </Badge>
    );
  }

  return (
    <Badge
      tone="#c9a13f"
      severity="warn"
      glyph="△"
      title={
        result.error
          ? `Subgraph unavailable: ${result.error}`
          : "SUBGRAPH_URL is not set — showing a fixture shaped exactly like schema.graphql"
      }
    >
      Fixture
    </Badge>
  );
}

export function QueryFooter({ result }: { result: GqlResult<unknown> | null }) {
  if (!result) return null;
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-hairline px-3.5 py-2">
      <span className="data truncate text-[11px] text-ink-faint">
        {result.endpoint}
      </span>
      {result.error ? (
        <span className="text-[11px]" style={{ color: "#c9a13f" }}>
          {result.error}
        </span>
      ) : null}
    </div>
  );
}
