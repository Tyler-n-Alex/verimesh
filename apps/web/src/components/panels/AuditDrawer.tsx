"use client";

import { useCallback, useMemo, useState } from "react";
import { AUTH_TIER_CODE, distinctNullifiers, type AuthTier } from "@verimesh/shared";
import { Overlay } from "@/components/ui/Overlay";
import { Badge, KeyValue } from "@/components/ui/Pill";
import { EmptyState, SectionCard, SkeletonRows } from "@/components/ui/Panel";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { clock, shortHash } from "@/lib/format";
import { NEUTRAL, tierSwatch, verdictSwatch } from "@/lib/palette";
import {
  DECISION_AUDIT_QUERY,
  REGISTRY_EXPLORER,
  type SubgraphApproval,
  type SubgraphDecision,
  type SubgraphFreeze,
  type SubgraphOverride,
} from "@/lib/subgraph";
import {
  FIXTURE_DECISIONS,
  fixtureApprovalsFor,
  fixtureDecisionById,
  fixtureFreezeFor,
  fixtureOverrideFor,
} from "@/lib/subgraphFixture";
import { useSubgraphQuery } from "@/hooks/useSubgraphQuery";
import { useMeshStore } from "@/store/mesh";
import { ZEROG_EXPLORER, zerogBlobUrl } from "@/lib/zerog";

interface AuditData {
  decisions: SubgraphDecision[];
  freezes: SubgraphFreeze[];
  approvals: SubgraphApproval[];
  overrides: SubgraphOverride[];
}

export function AuditDrawer() {
  const target = useMeshStore((s) => s.auditTarget);
  const openAudit = useMeshStore((s) => s.openAudit);
  const commit = useMeshStore((s) =>
    s.auditTarget?.kind === "proposal"
      ? (s.commits[s.auditTarget.proposalId] ?? null)
      : null
  );
  const proposal = useMeshStore((s) => {
    const active = s.auditTarget;
    if (active?.kind !== "proposal") return null;
    return s.proposals.find((p) => p.id === active.proposalId) ?? null;
  });

  const close = useCallback(() => openAudit(null), [openAudit]);

  const decisionId = useMemo(() => {
    if (!target) return "";
    if (target.kind === "decision") return target.decisionId;
    return commit?.chain_tx_hash ?? "";
  }, [target, commit]);

  const { result, loading } = useSubgraphQuery<AuditData>(
    DECISION_AUDIT_QUERY,
    { decisionId },
    () => {
      const direct = fixtureDecisionById(decisionId);
      const decision =
        direct ??
        (proposal
          ? (FIXTURE_DECISIONS.find((d) => d.nodeId === proposal.node_id) ??
            FIXTURE_DECISIONS[0])
          : FIXTURE_DECISIONS[0]);
      if (!decision) {
        return { decisions: [], freezes: [], approvals: [], overrides: [] };
      }
      return {
        decisions: [decision],
        freezes: fixtureFreezeFor(decision.id),
        approvals: fixtureApprovalsFor(decision.id),
        overrides: fixtureOverrideFor(decision.id),
      };
    },
    { skip: !target }
  );

  if (!target) return null;

  const decision = result?.data?.decisions?.[0] ?? null;
  const freeze = result?.data?.freezes?.[0] ?? null;
  const override = result?.data?.overrides?.[0] ?? null;
  const approvals = result?.data?.approvals ?? [];
  const distinct = distinctNullifiers(approvals.map((a) => a.worldIdNullifier));

  const tierName = decision
    ? (Object.keys(AUTH_TIER_CODE) as AuthTier[]).find(
        (key) => AUTH_TIER_CODE[key] === decision.authTier
      )
    : (commit?.auth_tier ?? proposal?.auth_tier ?? undefined);
  const tier = tierSwatch(tierName);

  const zerogRoot = decision?.zerogRoot ?? commit?.zerog_root ?? null;
  const txHash = decision?.txHash ?? commit?.chain_tx_hash ?? null;

  return (
    <Overlay
      onClose={close}
      labelledBy="audit-drawer-heading"
      align="bottom"
      dismissOnBackdrop
    >
      <div className="surface elevated animate-rise flex max-h-[88vh] min-h-0 w-full flex-col overflow-hidden rounded-t-xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3.5">
          <h2
            id="audit-drawer-heading"
            className="text-[15px] leading-none font-medium text-ink"
          >
            Audit record
          </h2>
          {decision ? (
            <span className="data text-[12px] text-ink-faint">
              {shortHash(decision.id, 8)}
            </span>
          ) : null}
          <SourceBadge result={result} loading={loading} />
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded px-1 text-[17px] leading-none text-ink-faint transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {loading && !result ? (
            <SkeletonRows rows={6} />
          ) : !decision ? (
            <EmptyState
              title="Nothing indexed for this decision yet"
              hint="The registry event may still be waiting for the subgraph to catch up. Indexing lag is expected — this view is history, not the live path."
            />
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-4">
                <SectionCard title="The indexed record · from The Graph">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    <KeyValue label="Node" value={decision.nodeId} />
                    <KeyValue label="Operator" value={decision.operator} />
                    <KeyValue label="Action" value={decision.action} />
                    <KeyValue
                      label="Verdict"
                      value={verdictSwatch(decision.verdict).label}
                      tone={
                        verdictSwatch(decision.verdict).severity === "none"
                          ? undefined
                          : verdictSwatch(decision.verdict).hex
                      }
                    />
                    <KeyValue label="Auth tier" value={tier.label} />
                    <KeyValue
                      label="Human authorized"
                      value={decision.humanAuthorized ? "Yes" : "No"}
                    />
                  </div>
                  <span className="num text-[11.5px] text-ink-faint">
                    Indexed at {clock(Number(decision.ts) * 1000)}
                  </span>
                </SectionCard>

                {freeze ? (
                  <SectionCard title="Why it froze">
                    <p className="text-[13px] leading-relaxed text-ink">
                      {freeze.reason}
                    </p>
                    <Badge>
                      Required {freeze.requiredQuorum} distinct human
                      {freeze.requiredQuorum === 1 ? "" : "s"}
                    </Badge>
                  </SectionCard>
                ) : null}

                <SectionCard title="Who authorized it · distinct signers">
                  {approvals.length === 0 ? (
                    <p className="text-[12.5px] text-ink-faint">
                      No human approvals — this decision was taken autonomously
                      at {tier.label}.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge glyph={distinct.length >= 2 ? "◉" : "◑"}>
                          {distinct.length} distinct human
                          {distinct.length === 1 ? "" : "s"}
                        </Badge>
                        {override ? (
                          <Badge glyph="✓">
                            Resolved {override.chosenAction}
                          </Badge>
                        ) : null}
                      </div>
                      <ul className="flex flex-col gap-1.5">
                        {approvals.map((approval) => (
                          <li
                            key={approval.id}
                            className="flex flex-col gap-1 rounded border border-hairline bg-panel px-2.5 py-2"
                          >
                            <div className="flex items-baseline gap-2.5">
                              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                                <span
                                  aria-hidden="true"
                                  className="h-2 w-2 rounded-[2px]"
                                  style={{
                                    background: `var(--${approval.operator.toLowerCase()}, ${NEUTRAL.faint})`,
                                  }}
                                />
                                {approval.operator}
                              </span>
                              <span className="text-[11.5px] text-ink-faint">
                                Signer {approval.approvalIndex + 1}
                              </span>
                              <span className="num ml-auto text-[11.5px] text-ink-faint">
                                {clock(Number(approval.ts) * 1000)}
                              </span>
                            </div>
                            <span
                              className="data truncate text-[11.5px] text-ink-dim"
                              title={approval.worldIdNullifier}
                            >
                              {approval.worldIdNullifier}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[12px] leading-relaxed text-ink-faint">
                        These are World ID nullifiers, not wallets. Two rows here
                        means two different real humans — the claim the chain
                        enforces with{" "}
                        <span className="data">DuplicateNullifier</span>.
                      </p>
                    </>
                  )}
                </SectionCard>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <SectionCard title="The immutable payload · 0G Storage">
                  {zerogRoot ? (
                    <>
                      <KeyValue label="0G root" value={zerogRoot} mono wrap />
                      <a
                        href={zerogBlobUrl(zerogRoot)}
                        target="_blank"
                        rel="noreferrer"
                        className="self-start rounded border border-hairline px-2.5 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
                      >
                        Open the reasoning blob ↗
                      </a>
                      <span className="data text-[11px] text-ink-faint">
                        {ZEROG_EXPLORER}
                      </span>
                    </>
                  ) : (
                    <StoreOnZeroG proposalId={proposal?.id ?? null} />
                  )}
                </SectionCard>

                <SectionCard title="The on-chain event · Base Sepolia">
                  {txHash ? (
                    <>
                      <KeyValue label="Registry tx" value={txHash} mono wrap />
                      <a
                        href={`${REGISTRY_EXPLORER}/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="self-start rounded border border-hairline px-2.5 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
                      >
                        Open on Basescan ↗
                      </a>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">
                      No registry transaction on this record yet.
                    </p>
                  )}
                  <p className="text-[12px] leading-relaxed text-ink-faint">
                    The decision record is indexed where The Graph can serve it;
                    the immutable payload lives on 0G, and every indexed row
                    carries its 0G root.
                  </p>
                </SectionCard>

                <RawQuery
                  queryText={result?.queryText ?? DECISION_AUDIT_QUERY}
                  endpoint={result?.endpoint ?? ""}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function StoreOnZeroG({ proposalId }: { proposalId: number | null }) {
  const [phase, setPhase] = useState<"idle" | "busy" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);

  if (proposalId === null) {
    return (
      <p className="text-[12.5px] text-ink-faint">
        No 0G root on this indexed record.
      </p>
    );
  }

  async function store() {
    setPhase("busy");
    setDetail(null);
    try {
      const res = await fetch("/api/zerog/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const body = (await res.json()) as {
        error?: string;
        rootHash?: string;
        bytes?: number;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPhase("idle");
      setDetail(`Stored ${body.bytes ?? 0} bytes — root ${body.rootHash}`);
    } catch (err) {
      setPhase("error");
      setDetail(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-ink-faint">
        No 0G root on this record yet.
      </p>
      <button
        type="button"
        disabled={phase === "busy"}
        onClick={() => void store()}
        className="self-start rounded border border-hairline px-2.5 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink disabled:opacity-40"
      >
        {phase === "busy" ? "Uploading to 0G…" : "Store the reasoning blob on 0G"}
      </button>
      {detail ? (
        <span
          className="data text-[11.5px] break-all"
          style={{
            color: phase === "error" ? "#d1524f" : "var(--color-ink-dim)",
          }}
        >
          {detail}
        </span>
      ) : null}
    </div>
  );
}

function RawQuery({
  queryText,
  endpoint,
}: {
  queryText: string;
  endpoint: string;
}) {
  const [copied, setCopied] = useState<"query" | "endpoint" | null>(null);

  const copy = useCallback(async (value: string, kind: "query" | "endpoint") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }, []);

  return (
    <SectionCard title="Run this yourself · any operator can">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void copy(endpoint, "endpoint")}
          className="text-[11.5px] text-ink-faint transition-colors hover:text-ink-dim"
        >
          {copied === "endpoint" ? "Copied" : "Copy endpoint"}
        </button>
        <button
          type="button"
          onClick={() => void copy(queryText, "query")}
          className="ml-auto rounded border border-hairline px-2 py-1 text-[11.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
        >
          {copied === "query" ? "Copied ✓" : "Copy query"}
        </button>
      </div>
      <pre className="scroll-thin data max-h-64 overflow-auto rounded border border-hairline bg-panel px-2.5 py-2 text-[11px] leading-relaxed text-ink-dim">
        {queryText.trim()}
      </pre>
    </SectionCard>
  );
}
