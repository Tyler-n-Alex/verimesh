"use client";

import { useMemo, useState } from "react";
import { AUTH_TIER_CODE, type AuthTier } from "@verimesh/shared";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { QueryFooter, SourceBadge } from "@/components/ui/SourceBadge";
import { ago, clock, shortHash } from "@/lib/format";
import { operatorSwatch, tierSwatch, verdictSwatch, OPERATOR_COLORS } from "@/lib/palette";
import {
  AUTHZ_LEDGER_QUERY,
  NODE_TIMELINE_QUERY,
  OPERATOR_DECISIONS_QUERY,
  REGISTRY_EXPLORER,
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
  { key: "decisions", label: "decisions" },
  { key: "timeline", label: "timeline" },
  { key: "authz", label: "✦ authz" },
];

export function GraphPanel() {
  const [tab, setTab] = useState<Tab>("decisions");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 border-b border-hairline bg-abyss">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className="panel-label relative px-3 py-1.5 text-[9px] transition-colors"
            style={{ color: tab === entry.key ? "#e8eefc" : undefined }}
          >
            {entry.label}
            {tab === entry.key ? (
              <span
                className="absolute inset-x-1 bottom-0 h-0.5 rounded-full"
                style={{ background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }}
              />
            ) : null}
          </button>
        ))}
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

  const { result, loading } = useSubgraphQuery<{ decisions: SubgraphDecision[] }>(
    OPERATOR_DECISIONS_QUERY,
    { operator, first: 50 },
    () => ({ decisions: fixtureDecisionsByOperator(operator) }),
    { pollMs: 20000 }
  );

  const rows = useMemo(() => {
    const all = result?.data?.decisions ?? [];
    if (verdict === "all") return all;
    return all.filter((d) => d.verdict === verdict);
  }, [result, verdict]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-1.5">
        {Object.keys(OPERATOR_COLORS).map((id) => (
          <button key={id} type="button" onClick={() => setOperator(id)}>
            <Pill
              color={operatorSwatch(id).hex}
              className={operator === id ? "" : "opacity-40"}
            >
              {id}
            </Pill>
          </button>
        ))}
        <span className="ml-auto">
          <SourceBadge result={result} loading={loading} />
        </span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-hairline px-3 py-1.5">
        {VERDICT_FILTERS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVerdict(v)}
            className="data rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wide transition-colors"
            style={{
              borderColor: verdict === v ? "#2b364d" : "transparent",
              background: verdict === v ? "#111725" : "transparent",
              color: v === "all" ? "#94a3b8" : verdictSwatch(v).hex,
              opacity: verdict === v ? 1 : 0.5,
            }}
          >
            {v === "all" ? "all" : verdictSwatch(v).label}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {loading && !result ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`no indexed decisions for ${operator}`}
            hint={
              verdict === "all"
                ? "The subgraph has not indexed a decision for this operator yet."
                : "Try clearing the verdict filter."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((decision) => (
              <li
                key={decision.id}
                onClick={() =>
                  openAudit({ kind: "decision", decisionId: decision.id })
                }
                className="animate-rise flex cursor-pointer flex-col gap-1 border-b border-hairline/40 px-3 py-1.5 hover:bg-panel-raised"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="data text-[11.5px] font-semibold text-ink">
                    {decision.nodeId}
                  </span>
                  <span className="data text-[11px] text-ink-dim">
                    {decision.action}
                  </span>
                  <span
                    className="data text-[10px] tracking-wide"
                    style={{ color: verdictSwatch(decision.verdict).hex }}
                  >
                    {verdictSwatch(decision.verdict).label}
                  </span>
                  <span className="data ml-auto text-[10px] text-ink-faint">
                    {ago(Number(decision.ts) * 1000, Date.now())} ago
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TierChip tier={decision.authTier} />
                  {decision.humanAuthorized ? (
                    <Pill color="#e879f9">human authorized</Pill>
                  ) : (
                    <Pill color="#34d399">autonomous</Pill>
                  )}
                  <span className="data text-[9px] text-ink-faint">
                    tx {shortHash(decision.txHash, 4)}
                  </span>
                </div>
              </li>
            ))}
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
    s.selectedNodeId ? (s.nodes[s.selectedNodeId]?.name ?? s.selectedNodeId) : null
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
    { skip: !selectedNodeId, pollMs: 20000 }
  );

  if (!selectedNodeId) {
    return (
      <EmptyState
        title="no node selected"
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
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-1.5">
        <span className="data text-[11.5px] font-semibold text-ink">
          {nodeName}
        </span>
        {history ? (
          <>
            <Pill color="#fbbf24">{history.incidentCount} incidents</Pill>
            <Pill color="#f43f5e">{history.violationCount} violations</Pill>
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
            title="no indexed incidents"
            hint={`The subgraph has nothing for ${nodeName} yet — this node has no on-chain history.`}
          />
        ) : (
          <ol className="flex flex-col px-3 py-2">
            {decisions.map((decision, index) => {
              const freeze = freezeByDecision.get(decision.id);
              const tone = verdictSwatch(decision.verdict).hex;
              return (
                <li key={decision.id} className="animate-rise flex gap-2.5">
                  <div className="flex flex-col items-center pt-1">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
                    />
                    {index < decisions.length - 1 ? (
                      <span className="mt-1 w-px flex-1 bg-hairline" />
                    ) : null}
                  </div>
                  <div
                    onClick={() =>
                      openAudit({ kind: "decision", decisionId: decision.id })
                    }
                    className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-1 ${
                      index < decisions.length - 1 ? "pb-3" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="data text-[11.5px] text-ink">
                        {decision.action}
                      </span>
                      <span
                        className="data text-[10px]"
                        style={{ color: tone }}
                      >
                        {verdictSwatch(decision.verdict).label}
                      </span>
                      <span className="data ml-auto text-[10px] text-ink-faint">
                        {clock(Number(decision.ts) * 1000)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TierChip tier={decision.authTier} />
                      {decision.humanAuthorized ? (
                        <Pill color="#e879f9">human authorized</Pill>
                      ) : null}
                    </div>
                    {freeze ? (
                      <p className="text-[11px] leading-snug text-ink-faint">
                        froze: {freeze.reason}
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
    { pollMs: 20000 }
  );

  const openAudit = useMeshStore((s) => s.openAudit);
  const authorities = result?.data?.humanAuthorities ?? [];
  const overrides = result?.data?.overrides ?? [];
  const approvals = result?.data?.approvals ?? [];

  const budget = 3;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-hairline px-3 py-1.5">
        <span className="panel-label text-[9px]">
          who authorized what · from the registry
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
            title="no human authorizations indexed"
            hint="Every accepted World ID scan emits a HumanApproval event; they appear here once indexed."
          />
        ) : (
          <div className="flex flex-col">
            <section className="flex flex-col gap-1.5 px-3 py-2">
              <span className="panel-label text-[9px]">
                per human · remaining override budget
              </span>
              {authorities.map((authority) => {
                const remaining = Math.max(0, budget - authority.overrideCount);
                const tone =
                  remaining === 0
                    ? "#f43f5e"
                    : remaining === 1
                      ? "#fbbf24"
                      : "#34d399";
                return (
                  <div
                    key={authority.id}
                    className="flex flex-col gap-1 rounded-sm border border-hairline bg-abyss px-2 py-1.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="data truncate text-[11px] text-ink">
                        {shortHash(authority.worldIdNullifier, 8)}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {authority.operators.map((op) => (
                          <Pill key={op} color={operatorSwatch(op).hex}>
                            {op}
                          </Pill>
                        ))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex gap-1">
                        {Array.from({ length: budget }).map((_, i) => (
                          <span
                            key={i}
                            className="h-1.5 w-5 rounded-full"
                            style={{
                              background:
                                i < authority.overrideCount ? tone : "#1c2436",
                              boxShadow:
                                i < authority.overrideCount
                                  ? `0 0 6px ${tone}`
                                  : "none",
                            }}
                          />
                        ))}
                      </span>
                      <span className="data text-[10px]" style={{ color: tone }}>
                        {remaining} of {budget} left
                      </span>
                      <span className="data ml-auto text-[9px] text-ink-faint">
                        last {clock(Number(authority.lastOverrideTs) * 1000)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-1.5 border-t border-hairline px-3 py-2">
              <span className="panel-label text-[9px]">
                per decision · distinct signers + tier
              </span>
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
                    className="flex cursor-pointer flex-col gap-1 rounded-sm border border-hairline bg-abyss px-2 py-1.5 hover:border-hairline-bright"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="data text-[11px] text-ink-dim">
                        {shortHash(override.decisionId, 5)}
                      </span>
                      <span className="data text-[11px] text-ink">
                        {override.chosenAction}
                      </span>
                      <span className="data ml-auto text-[9px] text-ink-faint">
                        {clock(Number(override.ts) * 1000)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill
                        color={
                          distinct.size >= 2 ? "#e879f9" : "#fbbf24"
                        }
                        title="distinct nullifiers that signed this decision"
                      >
                        {distinct.size} distinct human
                        {distinct.size === 1 ? "" : "s"}
                      </Pill>
                      {signers.map((signer) => (
                        <Pill
                          key={signer.id}
                          color={operatorSwatch(signer.operator).hex}
                          title={signer.worldIdNullifier}
                        >
                          {signer.operator}
                        </Pill>
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

export function TierChip({ tier }: { tier: number }) {
  const name = (Object.keys(AUTH_TIER_CODE) as AuthTier[]).find(
    (key) => AUTH_TIER_CODE[key] === tier
  );
  const swatch = tierSwatch(name);
  return <Pill color={swatch.hex}>{swatch.label}</Pill>;
}

export { REGISTRY_EXPLORER };
