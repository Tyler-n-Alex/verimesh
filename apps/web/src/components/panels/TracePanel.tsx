"use client";

import { Children, useMemo } from "react";
import { EmptyState } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { CitedHistoryPanel } from "@/components/panels/CitedHistoryPanel";
import { clock, num, pct, shortHash } from "@/lib/format";
import { statusSwatch, tierSwatch, verdictSwatch } from "@/lib/palette";
import { deriveCycle, type StepState, type TraceStep } from "@/lib/trace";
import { useMeshStore } from "@/store/mesh";

const STATE_TONE: Record<StepState, string> = {
  idle: "#2b364d",
  active: "#22d3ee",
  done: "#34d399",
  blocked: "#e879f9",
  failed: "#f43f5e",
};

export function TracePanel() {
  const proposals = useMeshStore((s) => s.proposals);
  const verdicts = useMeshStore((s) => s.verdicts);
  const commits = useMeshStore((s) => s.commits);
  const gates = useMeshStore((s) => s.gates);
  const events = useMeshStore((s) => s.events);
  const hydrated = useMeshStore((s) => s.hydrated);
  const nodes = useMeshStore((s) => s.nodes);
  const openGate = useMeshStore((s) => s.openGate);
  const openAudit = useMeshStore((s) => s.openAudit);
  const selectNode = useMeshStore((s) => s.selectNode);

  const cycle = useMemo(
    () => deriveCycle(useMeshStore.getState()),
    [proposals, verdicts, commits, gates, events, hydrated]
  );

  if (!hydrated) {
    return <EmptyState tone="waiting" title="waiting for the agent" />;
  }

  if (!cycle.proposal && events.length === 0) {
    return (
      <EmptyState
        title="agent idle"
        hint="The loop has not proposed anything yet. Steps appear here as it reasons."
      />
    );
  }

  const { proposal, verdict, commit, gate, cited, nodeId } = cycle;
  const node = nodeId ? nodes[nodeId] : undefined;
  const tier = proposal?.auth_tier ?? gate?.required_tier ?? null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline bg-abyss px-3 py-2">
        {node ? (
          <button
            type="button"
            onClick={() => selectNode(node.id)}
            className="data text-[12px] font-semibold text-ink underline decoration-hairline-bright decoration-dotted underline-offset-2"
          >
            {node.name}
          </button>
        ) : (
          <span className="data text-[12px] text-ink-dim">mesh-wide</span>
        )}
        {node ? (
          <Pill color={statusSwatch(node.status).hex} pulse={node.status === "violation"}>
            {node.status}
          </Pill>
        ) : null}
        {tier ? (
          <Pill color={tierSwatch(tier).hex}>{tierSwatch(tier).label}</Pill>
        ) : null}
        {commit ? (
          <button
            type="button"
            onClick={() =>
              openAudit({ kind: "proposal", proposalId: commit.proposal_id })
            }
          >
            <Pill color="#22d3ee">audit ↗</Pill>
          </button>
        ) : null}
      </div>

      <ol className="flex flex-col px-3 py-2">
        {cycle.steps.map((step, index) => (
          <Step
            key={step.key}
            step={step}
            last={index === cycle.steps.length - 1}
          >
            {step.key === "history" && cited ? (
              <CitedHistoryPanel cited={cited} />
            ) : null}

            {step.key === "propose" && proposal ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] leading-relaxed text-ink">
                  {proposal.diagnosis ?? "—"}
                </p>
                {proposal.expected_effect ? (
                  <p className="text-[11.5px] leading-relaxed text-ink-dim">
                    <span className="panel-label mr-1.5 text-[9px]">effect</span>
                    {proposal.expected_effect}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  <ConfidenceBar value={proposal.confidence ?? 0} />
                  {proposal.llm_provider ? (
                    <Pill
                      color={proposal.zerog_inference_valid ? "#22d3ee" : "#fbbf24"}
                      title={
                        proposal.zerog_inference_valid
                          ? "0G Compute TEE attestation verified"
                          : "attestation not verified"
                      }
                    >
                      {proposal.llm_provider}
                      {proposal.zerog_inference_valid ? " · attested" : " · unattested"}
                    </Pill>
                  ) : null}
                  {(proposal.risk_flags ?? []).map((flag) => (
                    <Pill key={flag} color="#fbbf24">
                      {flag}
                    </Pill>
                  ))}
                </div>
              </div>
            ) : null}

            {step.key === "verify" && verdict ? (
              <div className="flex flex-col gap-1.5">
                <Pill
                  color={verdictSwatch(verdict.verdict).hex}
                  pulse={verdict.verdict !== "VERIFIED"}
                >
                  {verdictSwatch(verdict.verdict).label}
                </Pill>
                {verdict.detail ? (
                  <p className="text-[11.5px] leading-relaxed text-ink-dim">
                    {verdict.detail}
                  </p>
                ) : null}
                {verdict.violated ? <ViolationRow violated={verdict.violated} /> : null}
              </div>
            ) : null}

            {step.key === "resolve" && gate && gate.status === "pending" ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] leading-relaxed text-ink">
                  {gate.reason ?? "Human authorization required."}
                </p>
                <button
                  type="button"
                  onClick={() => openGate(gate.id)}
                  className="data self-start rounded-sm border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors"
                  style={{
                    borderColor: "#e879f955",
                    background: "#e879f918",
                    color: "#e879f9",
                  }}
                >
                  review authorization →
                </button>
              </div>
            ) : null}

            {step.key === "resolve" && commit ? (
              <div className="flex flex-col gap-1">
                <KeyValue label="action" value={commit.applied_action ?? "—"} />
                <KeyValue
                  label="0G root"
                  value={shortHash(commit.zerog_root)}
                  mono
                />
                <KeyValue
                  label="registry tx"
                  value={shortHash(commit.chain_tx_hash)}
                  mono
                />
              </div>
            ) : null}
          </Step>
        ))}
      </ol>
    </div>
  );
}

function Step({
  step,
  last,
  children,
}: {
  step: TraceStep;
  last: boolean;
  children?: React.ReactNode;
}) {
  const tone = STATE_TONE[step.state];
  const dim = step.state === "idle";
  const detail = Children.toArray(children);
  const hasDetail = detail.length > 0;
  const hasBody = hasDetail || Boolean(step.headline);

  return (
    <li className="animate-rise flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            step.state === "active" || step.state === "blocked"
              ? "animate-pulse-dot"
              : ""
          }`}
          style={{
            background: dim ? "transparent" : tone,
            border: `1.5px solid ${tone}`,
            boxShadow: dim ? "none" : `0 0 8px ${tone}`,
          }}
        />
        {!last ? (
          <span
            className="mt-1 w-px flex-1"
            style={{ background: dim ? "#1c2436" : `${tone}44` }}
          />
        ) : null}
      </div>

      <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${last ? "pb-1" : "pb-4"}`}>
        <div className="flex items-baseline gap-2">
          <span
            className="data text-[11px] font-semibold tracking-wider uppercase"
            style={{ color: dim ? "#5b6880" : tone }}
          >
            {step.label}
          </span>
          {step.ts ? (
            <span className="data text-[10px] text-ink-faint">
              {clock(step.ts)}
            </span>
          ) : null}
        </div>

        {hasBody ? (
          <div className="flex flex-col gap-2">
            {step.headline && !hasDetail ? (
              <p
                className={`text-[11.5px] leading-relaxed ${dim ? "text-ink-faint" : "text-ink-dim"}`}
              >
                {step.headline}
              </p>
            ) : null}
            {detail}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const tone = value >= 0.8 ? "#34d399" : value >= 0.6 ? "#fbbf24" : "#f43f5e";
  return (
    <span className="flex items-center gap-1.5">
      <span className="panel-label text-[9px]">confidence</span>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-hairline">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, value * 100))}%`,
            background: tone,
            boxShadow: `0 0 8px ${tone}`,
          }}
        />
      </span>
      <span className="data text-[11px]" style={{ color: tone }}>
        {pct(value)}
      </span>
    </span>
  );
}

function ViolationRow({ violated }: { violated: Record<string, unknown> }) {
  const node = String(violated.node ?? "—");
  const metric = String(violated.metric ?? "—");
  const value = Number(violated.value ?? 0);
  const bound = Number(violated.bound ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-[#f43f5e33] bg-[#f43f5e0f] px-2 py-1.5">
      <span className="panel-label text-[9px]" style={{ color: "#f43f5e" }}>
        breach
      </span>
      <span className="data text-[11.5px] text-ink">{node}</span>
      <span className="data text-[11px] text-ink-dim">{metric}</span>
      <span className="data text-[11.5px]" style={{ color: "#f43f5e" }}>
        {num(value)}
      </span>
      <span className="data text-[10px] text-ink-faint">vs bound {num(bound)}</span>
    </div>
  );
}

function KeyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="panel-label w-[68px] shrink-0 text-[9px]">{label}</span>
      <span
        className={`truncate text-[11.5px] text-ink-dim ${mono ? "data" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
