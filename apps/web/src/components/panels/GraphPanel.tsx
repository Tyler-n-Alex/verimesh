"use client";

import { useMemo, useState } from "react";
import { AUTH_TIER_CODE, authzConfig, type AuthTier } from "@verimesh/shared";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Pill";
import { QueryFooter, SourceBadge } from "@/components/ui/SourceBadge";
import { ago, clock, shortHash } from "@/lib/format";
import {
  NEUTRAL,
  OPERATOR_COLORS,
  tierSwatch,
  verdictSwatch,
} from "@/lib/palette";
import {
  AUTHZ_LEDGER_QUERY,
  NODE_TIMELINE_QUERY,
  OPERATOR_DECISIONS_QUERY,
  type SubgraphApproval,
  type SubgraphDecision,
  type SubgraphFreeze,
  type SubgraphHumanAuthority,
  type SubgraphNodeHistory,
  type SubgraphOverride,
} from "@/lib/subgraph";
import {
  FIXTURE_APPROVALS,
  FIXTURE_AUTHORITIES,
  FIXTURE_OVERRIDES,
  fixtureDecisionsByNode,
  fixtureDecisionsByOperator,
  fixtureFreezesByNode,
  fixtureNodeHistories,
} from "@/lib/subgraphFixture";
import { useSubgraphQuery } from "@/hooks/useSubgraphQuery";
import { useMeshStore } from "@/store/mesh";

type Tab = "decisions" | "timeline" | "authz";

const TABS: { key: Tab; label: string }[] = [
  { key: "decisions", label: "Decisions" },
  { key: "timeline", label: "Timeline" },
  { key: "authz", label: "Authorization" },
];

export function GraphPanel() {
  const [tab, setTab] = useState<Tab>("decisions");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav
        className="flex shrink-0 gap-1 border-b border-hairline px-2.5"
        role="tablist"
      >
        {TABS.map((entry) => {
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className="relative px-2 py-2.5 text-[12.5px] transition-colors"
              style={{ color: active ? NEUTRAL.text : NEUTRAL.faint }}
            >
              {entry.label}
              {active ? (
                <span
                  className="absolute inset-x-1 -bottom-px h-[2px] rounded-full"
                  style={{ background: NEUTRAL.text }}
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1">
        {tab === "decisions" ? <DecisionHistory /> : null}
        {tab === "timeline" ? <NodeTimeline /> : null}
        {tab === "authz" ? <AuthzLedger /> : null}
      </div>
    </div>
  );
}

const VERDICT_FILTERS = ["all", "VERIFIED", "VIOLATION_TRIGGERED", "ESCALATE"];

function DecisionHistory() {
  const [operator, setOperator] = useState("opA");
  const [verdict, setVerdict] = useState("all");
  const openAudit = useMeshStore((s) => s.openAudit);

  const { result, loading } = useSubgraphQuery<{
    decisions: SubgraphDecision[];
  }>(
    OPERATOR_DECISIONS_QUERY,
    { operator, first: 50 },
    () => ({ decisions: fixtureDecisionsByOperator(operator) }),
    { pollMs: 60000 }
  );

  const rows = useMemo(() => {
    const all = result?.data?.decisions ?? [];
    if (verdict === "all") return all;
    return all.filter((d) => d.verdict === verdict);
  }, [result, verdict]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-3.5 py-2.5">
        <Segmented
          options={Object.keys(OPERATOR_COLORS)}
          value={operator}
          onChange={setOperator}
        />
        <span className="ml-auto">
          <SourceBadge result={result} loading={loading} />
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-hairline px-3.5 py-2">
        {VERDICT_FILTERS.map((v) => {
          const active = verdict === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              className="rounded border px-2 py-1 text-[11.5px] transition-colors"
              style={{
                borderColor: active ? NEUTRAL.lineBright : "transparent",
                background: active ? NEUTRAL.raised : "transparent",
                color: active ? NEUTRAL.text : NEUTRAL.faint,
              }}
            >
              {v === "all" ? "All" : verdictSwatch(v).label}
            </button>
          );
        })}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {loading && !result ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No indexed decisions for ${operator}`}
            hint={
              verdict === "all"
                ? "The subgraph has not indexed a decision for this operator yet."
                : "Try clearing the verdict filter."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((decision) => {
              const vd = verdictSwatch(decision.verdict);
              return (
                <li
                  key={decision.id}
                  onClick={() =>
                    openAudit({ kind: "decision", decisionId: decision.id })
                  }
                  className="animate-rise row-hover flex cursor-pointer flex-col gap-1.5 border-b border-hairline/60 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="text-[13px] font-medium text-ink">
                      {decision.nodeId}
                    </span>
                    <span className="text-[12.5px] text-ink-dim">
                      {decision.action}
                    </span>
                    <span
                      className="text-[12px]"
                      style={{
                        color:
                          vd.severity === "none" ? NEUTRAL.faint : vd.hex,
                      }}
                    >
                      {vd.label}
                    </span>
                    <span className="num ml-auto text-[11.5px] text-ink-faint">
                      {ago(Number(decision.ts) * 1000, Date.now())} ago
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TierChip tier={decision.authTier} />
                    {decision.humanAuthorized ? (
                      <Badge glyph="◉">Human authorized</Badge>
                    ) : (
                      <Badge glyph="○">Autonomous</Badge>
                    )}
                    <span className="data text-[11px] text-ink-faint">
                      {shortHash(decision.txHash, 4)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <QueryFooter result={result} />
    </div>
  );
}

function NodeTimeline() {
  const selectedNodeId = useMeshStore((s) => s.selectedNodeId);
  const nodeName = useMeshStore((s) =>
    s.selectedNodeId
      ? (s.nodes[s.selectedNodeId]?.name ?? s.selectedNodeId)
      : null
  );
  const openAudit = useMeshStore((s) => s.openAudit);
  const nodeId = selectedNodeId ?? "";

  const { result, loading } = useSubgraphQuery<{
    decisions: SubgraphDecision[];
    freezes: SubgraphFreeze[];
    nodeHistories: SubgraphNodeHistory[];
  }>(
    NODE_TIMELINE_QUERY,
    { nodeId, first: 40 },
    () => ({
      decisions: fixtureDecisionsByNode(nodeId),
      freezes: fixtureFreezesByNode(nodeId),
      nodeHistories: fixtureNodeHistories(nodeId),
    }),
    { skip: !selectedNodeId, pollMs: 60000 }
  );

  if (!selectedNodeId) {
    return (
      <EmptyState
        title="No node selected"
        hint="Select a node to see everything the subgraph has indexed about it."
      />
    );
  }

  const history = result?.data?.nodeHistories?.[0];
  const decisions = result?.data?.decisions ?? [];
  const freezes = result?.data?.freezes ?? [];
  const freezeByDecision = new Map(freezes.map((f) => [f.decisionId, f]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-3.5 py-2.5">
        <span className="text-[13px] font-medium text-ink">{nodeName}</span>
        {history ? (
          <>
            <Badge
              tone={history.incidentCount >= 2 ? "#c9a13f" : undefined}
              severity={history.incidentCount >= 2 ? "warn" : "none"}
            >
              {history.incidentCount} incidents
            </Badge>
            <Badge
              tone={history.violationCount > 0 ? "#d1524f" : undefined}
              severity={history.violationCount > 0 ? "danger" : "none"}
            >
              {history.violationCount} violations
            </Badge>
          </>
        ) : null}
        <span className="ml-auto">
          <SourceBadge result={result} loading={loading} />
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {loading && !result ? (
          <SkeletonRows rows={4} />
        ) : decisions.length === 0 ? (
          <EmptyState
            title="No indexed incidents"
            hint={`The subgraph has nothing for ${nodeName} yet — this node has no on-chain history.`}
          />
        ) : (
          <ol className="flex flex-col px-3.5 py-3">
            {decisions.map((decision, index) => {
              const freeze = freezeByDecision.get(decision.id);
              const vd = verdictSwatch(decision.verdict);
              const last = index === decisions.length - 1;
              return (
                <li key={decision.id} className="animate-rise flex gap-3">
                  <div className="flex flex-col items-center pt-[5px]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          vd.severity === "none" ? NEUTRAL.lineBright : vd.hex,
                      }}
                    />
                    {!last ? (
                      <span
                        className="mt-1.5 w-px flex-1"
                        style={{ background: NEUTRAL.line }}
                      />
                    ) : null}
                  </div>
                  <div
                    onClick={() =>
                      openAudit({ kind: "decision", decisionId: decision.id })
                    }
                    className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 ${last ? "" : "pb-4"}`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="text-[12.5px] text-ink">
                        {decision.action}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{
                          color:
                            vd.severity === "none" ? NEUTRAL.faint : vd.hex,
                        }}
                      >
                        {vd.label}
                      </span>
                      <span className="num ml-auto text-[11.5px] text-ink-faint">
                        {clock(Number(decision.ts) * 1000)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TierChip tier={decision.authTier} />
                      {decision.humanAuthorized ? (
                        <Badge glyph="◉">Human authorized</Badge>
                      ) : null}
                    </div>
                    {freeze ? (
                      <p className="text-[12px] leading-relaxed text-ink-faint">
                        Froze: {freeze.reason}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <QueryFooter result={result} />
    </div>
  );
}

function AuthzLedger() {
  const { result, loading } = useSubgraphQuery<{
    approvals: SubgraphApproval[];
    humanAuthorities: SubgraphHumanAuthority[];
    overrides: SubgraphOverride[];
  }>(
    AUTHZ_LEDGER_QUERY,
    { first: 50 },
    () => ({
      approvals: FIXTURE_APPROVALS,
      humanAuthorities: FIXTURE_AUTHORITIES,
      overrides: FIXTURE_OVERRIDES,
    }),
    { pollMs: 60000 }
  );

  const openAudit = useMeshStore((s) => s.openAudit);
  const authorities = result?.data?.humanAuthorities ?? [];
  const overrides = result?.data?.overrides ?? [];
  const approvals = result?.data?.approvals ?? [];
  const budget = (authzConfig as { budgetPerWindow: number }).budgetPerWindow;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-2.5">
        <span className="text-[12px] text-ink-faint">
          Who authorized what, from the registry
        </span>
        <span className="ml-auto">
          <SourceBadge result={result} loading={loading} />
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {loading && !result ? (
          <SkeletonRows rows={4} />
        ) : authorities.length === 0 && overrides.length === 0 ? (
          <EmptyState
            title="No human authorizations indexed"
            hint="Every accepted World ID scan emits a HumanApproval event; they appear here once indexed."
          />
        ) : (
          <div className="flex flex-col">
            <section className="flex flex-col gap-2 px-3.5 py-3">
              <h4 className="text-[12px] font-medium text-ink-faint">
                Per human · remaining override budget
              </h4>
              {authorities.map((authority) => {
                const remaining = Math.max(0, budget - authority.overrideCount);
                const exhausted = remaining === 0;
                const low = remaining === 1;
                const tone = exhausted
                  ? "#d1524f"
                  : low
                    ? "#c9a13f"
                    : NEUTRAL.dim;
                return (
                  <div
                    key={authority.id}
                    className="flex flex-col gap-2 rounded-lg border border-hairline bg-abyss px-2.5 py-2"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="data truncate text-[12px] text-ink-dim">
                        {shortHash(authority.worldIdNullifier, 8)}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {authority.operators.map((op) => (
                          <Badge key={op}>{op}</Badge>
                        ))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex gap-1">
                        {Array.from({ length: budget }).map((_, i) => (
                          <span
                            key={i}
                            className="h-1 w-6 rounded-full"
                            style={{
                              background:
                                i < authority.overrideCount
                                  ? tone
                                  : NEUTRAL.line,
                            }}
                          />
                        ))}
                      </span>
                      <span className="num text-[11.5px]" style={{ color: tone }}>
                        {remaining} of {budget} left
                      </span>
                      <span className="num ml-auto text-[11.5px] text-ink-faint">
                        Last {clock(Number(authority.lastOverrideTs) * 1000)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-2 border-t border-hairline px-3.5 py-3">
              <h4 className="text-[12px] font-medium text-ink-faint">
                Per decision · distinct signers and tier
              </h4>
              {overrides.map((override) => {
                const signers = approvals.filter(
                  (a) => a.decisionId === override.decisionId
                );
                const distinct = new Set(
                  signers.map((s) => s.worldIdNullifier.toLowerCase())
                );
                return (
                  <div
                    key={override.id}
                    onClick={() =>
                      openAudit({
                        kind: "decision",
                        decisionId: override.decisionId,
                      })
                    }
                    className="row-hover flex cursor-pointer flex-col gap-2 rounded-lg border border-hairline bg-abyss px-2.5 py-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="data text-[11.5px] text-ink-faint">
                        {shortHash(override.decisionId, 5)}
                      </span>
                      <span className="text-[12.5px] text-ink">
                        {override.chosenAction}
                      </span>
                      <span className="num ml-auto text-[11.5px] text-ink-faint">
                        {clock(Number(override.ts) * 1000)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        glyph={distinct.size >= 2 ? "◉" : "◑"}
                        title="Distinct nullifiers that signed this decision"
                      >
                        {distinct.size} distinct human
                        {distinct.size === 1 ? "" : "s"}
                      </Badge>
                      {signers.map((signer) => (
                        <Badge key={signer.id} title={signer.worldIdNullifier}>
                          {signer.operator}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </div>

      <QueryFooter result={result} />
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-hairline p-0.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="rounded px-2.5 py-1 text-[12px] transition-colors"
            style={{
              background: active ? NEUTRAL.raised : "transparent",
              color: active ? NEUTRAL.text : NEUTRAL.faint,
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function TierChip({ tier }: { tier: number }) {
  const name = (Object.keys(AUTH_TIER_CODE) as AuthTier[]).find(
    (key) => AUTH_TIER_CODE[key] === tier
  );
  const swatch = tierSwatch(name);
  return (
    <Badge tone={swatch.hex} severity={swatch.severity} glyph={swatch.glyph}>
      {swatch.label}
    </Badge>
  );
}
