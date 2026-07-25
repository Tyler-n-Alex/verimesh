"use client";

import { useCallback, useMemo, useState } from "react";
import { AUTH_TIER_CODE, distinctNullifiers, type AuthTier } from "@verimesh/shared";
import { Overlay } from "@/components/ui/Overlay";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { clock, shortHash } from "@/lib/format";
import { operatorSwatch, tierSwatch, verdictSwatch } from "@/lib/palette";
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
    <Overlay onClose={close} labelledBy="audit-drawer-heading" align="bottom" dismissOnBackdrop>
      <div className="surface animate-rise flex max-h-[86vh] min-h-0 w-full flex-col overflow-hidden rounded-t-lg">
        <header className="flex shrink-0 items-center gap-3 border-b border-hairline bg-panel-raised px-4 py-2.5">
          <h2
            id="audit-drawer-heading"
            className="panel-label text-[11px] tracking-[0.18em] text-ink"
          >
            audit record
          </h2>
          {decision ? (
            <span className="data text-[11px] text-ink-faint">
              {shortHash(decision.id, 8)}
            </span>
          ) : null}
          <SourceBadge result={result} loading={loading} />
          <button
            type="button"
            onClick={close}
            className="data ml-auto text-[18px] leading-none text-ink-faint transition-colors hover:text-ink"
            aria-label="close"
          >
            ×
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {loading && !result ? (
            <SkeletonRows rows={6} />
          ) : !decision ? (
            <EmptyState
              title="nothing indexed for this decision yet"
              hint="The registry event may still be waiting for the subgraph to catch up. Indexing lag is expected — this view is history, not the live path."
            />
          ) : (
            <div className="grid gap-3 p-3 lg:grid-cols-[1.15fr_1fr]">
              <div className="flex flex-col gap-3">
                <Section title="the indexed record · from The Graph">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="node" value={decision.nodeId} />
                    <Field
                      label="operator"
                      value={decision.operator}
                      tone={operatorSwatch(decision.operator).hex}
                    />
                    <Field label="action" value={decision.action} />
                    <Field
                      label="verdict"
                      value={verdictSwatch(decision.verdict).label}
                      tone={verdictSwatch(decision.verdict).hex}
                    />
                    <Field
                      label="auth tier"
                      value={tier.label}
                      tone={tier.hex}
                    />
                    <Field
                      label="human authorized"
                      value={decision.humanAuthorized ? "yes" : "no"}
                      tone={decision.humanAuthorized ? "#e879f9" : "#34d399"}
                    />
                  </div>
                  <span className="data text-[10px] text-ink-faint">
                    indexed at {clock(Number(decision.ts) * 1000)}
                  </span>
                </Section>

                {freeze ? (
                  <Section title="why it froze">
                    <p className="text-[12.5px] leading-relaxed text-ink">
                      {freeze.reason}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill color={tier.hex}>
                        required {freeze.requiredQuorum} distinct human
                        {freeze.requiredQuorum === 1 ? "" : "s"}
                      </Pill>
                    </div>
                  </Section>
                ) : null}

                <Section title="✦ who authorized it · distinct signers">
                  {approvals.length === 0 ? (
                    <p className="data text-[11.5px] text-ink-faint">
                      no human approvals — this decision was taken autonomously
                      at {tier.label}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill color={distinct.length >= 2 ? "#e879f9" : "#fbbf24"}>
                          {distinct.length} distinct human
                          {distinct.length === 1 ? "" : "s"}
                        </Pill>
                        {override ? (
                          <Pill color="#34d399">
                            resolved {override.chosenAction}
                          </Pill>
                        ) : null}
                      </div>
                      <ul className="flex flex-col gap-1">
                        {approvals.map((approval) => (
                          <li
                            key={approval.id}
                            className="flex flex-col gap-0.5 rounded-sm border border-hairline bg-abyss px-2 py-1.5"
                          >
                            <div className="flex items-baseline gap-2">
                              <span
                                className="data text-[11px] font-semibold"
                                style={{
                                  color: operatorSwatch(approval.operator).hex,
                                }}
                              >
                                {approval.operator}
                              </span>
                              <span className="data text-[10px] text-ink-faint">
                                signer #{approval.approvalIndex + 1}
                              </span>
                              <span className="data ml-auto text-[10px] text-ink-faint">
                                {clock(Number(approval.ts) * 1000)}
                              </span>
                            </div>
                            <span
                              className="data truncate text-[10.5px] text-ink-dim"
                              title={approval.worldIdNullifier}
                            >
                              {approval.worldIdNullifier}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[10.5px] leading-relaxed text-ink-faint">
                        These are World ID nullifiers, not wallets. Two rows here
                        means two different real humans — that is the claim the
                        chain enforces with{" "}
                        <span className="data">DuplicateNullifier</span>.
                      </p>
                    </>
                  )}
                </Section>
              </div>

              <div className="flex flex-col gap-3">
                <Section title="the immutable payload · 0G Storage">
                  {zerogRoot ? (
                    <>
                      <Field label="zerog root" value={zerogRoot} mono wrap />
                      <a
                        href={zerogBlobUrl(zerogRoot)}
                        target="_blank"
                        rel="noreferrer"
                        className="data self-start rounded-sm border px-2 py-1 text-[11px] transition-colors"
                        style={{
                          borderColor: "#22d3ee55",
                          background: "#22d3ee12",
                          color: "#22d3ee",
                        }}
                      >
                        open the reasoning blob ↗
                      </a>
                      <span className="data text-[10px] text-ink-faint">
                        {ZEROG_EXPLORER}
                      </span>
                    </>
                  ) : (
                    <StoreOnZeroG proposalId={proposal?.id ?? null} />
                  )}
                </Section>

                <Section title="the on-chain event · Base Sepolia">
                  {txHash ? (
                    <>
                      <Field label="registry tx" value={txHash} mono wrap />
                      <a
                        href={`${REGISTRY_EXPLORER}/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="data self-start rounded-sm border px-2 py-1 text-[11px] transition-colors"
                        style={{
                          borderColor: "#34d39955",
                          background: "#34d39912",
                          color: "#34d399",
                        }}
                      >
                        open on Basescan ↗
                      </a>
                    </>
                  ) : (
                    <p className="data text-[11.5px] text-ink-faint">
                      no registry tx on this record yet
                    </p>
                  )}
                  <p className="text-[10.5px] leading-relaxed text-ink-faint">
                    The decision record is indexed where The Graph can serve it;
                    the immutable payload lives on 0G, and every indexed row
                    carries its 0G root.
                  </p>
                </Section>

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
      <p className="data text-[11.5px] text-ink-faint">
        no 0G root on this indexed record
      </p>
    );
  }

  async function store() {
    setPhase("busy");
    setDetail(null);
    try {
      const res = await fetch("/api/zerog/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const body = (await res.json()) as {
        error?: string;
        rootHash?: string;
        bytes?: number;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPhase("idle");
      setDetail(`stored ${body.bytes ?? 0} bytes — root ${body.rootHash}`);
    } catch (err) {
      setPhase("error");
      setDetail(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="data text-[11.5px] text-ink-faint">
        no 0G root on this record yet
      </p>
      <button
        type="button"
        disabled={phase === "busy"}
        onClick={() => void store()}
        className="data self-start rounded-sm border px-2 py-1 text-[11px] transition-colors disabled:opacity-40"
        style={{
          borderColor: "#22d3ee55",
          background: "#22d3ee12",
          color: "#22d3ee",
        }}
      >
        {phase === "busy" ? "uploading to 0G…" : "store the reasoning blob on 0G"}
      </button>
      {detail ? (
        <span
          className="data text-[10.5px] break-all"
          style={{ color: phase === "error" ? "#f43f5e" : "#34d399" }}
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
    <section className="flex min-h-0 flex-col gap-1.5 rounded-md border border-hairline bg-abyss p-2.5">
      <div className="flex items-center gap-2">
        <span className="panel-label text-[9px]">
          run this yourself · any operator can
        </span>
        <button
          type="button"
          onClick={() => void copy(endpoint, "endpoint")}
          className="data ml-auto text-[10px] text-ink-faint transition-colors hover:text-ink-dim"
        >
          {copied === "endpoint" ? "copied" : "copy endpoint"}
        </button>
        <button
          type="button"
          onClick={() => void copy(queryText, "query")}
          className="data rounded-sm border border-hairline px-1.5 py-0.5 text-[10px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
        >
          {copied === "query" ? "copied ✓" : "copy query"}
        </button>
      </div>
      <pre className="scroll-thin data max-h-64 overflow-auto rounded-sm border border-hairline bg-void px-2 py-1.5 text-[10px] leading-relaxed text-ink-dim">
        {queryText.trim()}
      </pre>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-hairline bg-abyss p-2.5">
      <span className="panel-label text-[9px]">{title}</span>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  tone,
  mono = false,
  wrap = false,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="panel-label text-[8.5px]">{label}</span>
      <span
        className={`text-[12px] font-semibold ${mono ? "data" : "data"} ${
          wrap ? "break-all" : "truncate"
        }`}
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
      </span>
    </div>
  );
}
