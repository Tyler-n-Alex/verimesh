"use client";

import { Children, useMemo } from "react";
import { EmptyState } from "@/components/ui/Panel";
import { Badge, KeyValue, StatusTag } from "@/components/ui/Pill";
import { CitedHistoryPanel } from "@/components/panels/CitedHistoryPanel";
import { clock, num, pct, shortHash } from "@/lib/format";
import { ACCENT, NEUTRAL, tierSwatch, verdictSwatch } from "@/lib/palette";
import { deriveCycle, type StepState, type TraceStep } from "@/lib/trace";
import { useMeshStore } from "@/store/mesh";

const STATE_TONE: Record<StepState, string> = {
  idle: NEUTRAL.lineBright,
  active: ACCENT,
  done: NEUTRAL.dim,
  blocked: ACCENT,
  failed: "#d1524f",
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
    return <EmptyState tone="waiting" title="Waiting for the agent…" />;
  }

  if (!cycle.proposal && events.length === 0) {
    return (
      <EmptyState
        title="Agent idle"
        hint="The loop has not proposed anything yet. Steps appear here as it reasons."
      />
    );
  }

  const { proposal, verdict, commit, gate, cited, nodeId, pending } = cycle;
  const node = nodeId ? nodes[nodeId] : undefined;
  const tierName = proposal?.auth_tier ?? gate?.required_tier ?? null;
  const tier = tierName ? tierSwatch(tierName) : null;

  return (
    <div className="flex flex-col">
      {pending ? (
        <div
          className="flex items-center gap-2.5 border-b border-hairline px-3.5 py-2.5"
          style={{ background: `${ACCENT}14` }}
          role="status"
          aria-live="polite"
        >
          <span
            className="animate-attention h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: ACCENT }}
          />
          <span className="text-[12.5px] leading-snug text-ink">
            {pending.label}
            <span className="text-ink-faint">…</span>
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3.5 py-2.5">
        {node ? (
          <button
            type="button"
            onClick={() => selectNode(node.id)}
            className="text-[13px] font-medium text-ink hover:underline"
          >
            {node.name}
          </button>
        ) : (
          <span className="text-[13px] text-ink-dim">Mesh-wide</span>
        )}
        {node ? <StatusTag status={node.status} attention /> : null}
        {tier ? (
          <Badge tone={tier.hex} severity={tier.severity} glyph={tier.glyph}>
            {tier.label}
          </Badge>
        ) : null}
        {commit ? (
          <button
            type="button"
            onClick={() =>
              openAudit({ kind: "proposal", proposalId: commit.proposal_id })
            }
            className="ml-auto text-[12px] text-ink-dim transition-colors hover:text-ink"
          >
            View audit record →
          </button>
        ) : null}
      </div>

      <ol className="flex flex-col px-3.5 py-3">
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
              <div className="flex flex-col gap-2.5">
                <p className="text-[13px] leading-relaxed text-ink">
                  {proposal.diagnosis ?? "—"}
                </p>
                {proposal.expected_effect ? (
                  <p className="text-[12.5px] leading-relaxed text-ink-dim">
                    <span className="text-ink-faint">Expected effect. </span>
                    {proposal.expected_effect}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Confidence value={proposal.confidence ?? 0} />
                  {proposal.llm_provider ? (
                    <Badge
                      glyph={proposal.zerog_inference_valid ? "✓" : "△"}
                      tone={
                        proposal.zerog_inference_valid ? undefined : "#c9a13f"
                      }
                      severity={
                        proposal.zerog_inference_valid ? "none" : "warn"
                      }
                      title={
                        proposal.zerog_inference_valid
                          ? "0G Compute TEE attestation verified"
                          : "Attestation not verified"
                      }
                    >
                      {proposal.llm_provider}
                      {proposal.zerog_inference_valid
                        ? " · attested"
                        : " · unattested"}
                    </Badge>
                  ) : null}
                  {(proposal.risk_flags ?? []).map((flag) => (
                    <Badge key={flag}>{flag}</Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {step.key === "verify" && verdict ? (
              <div className="flex flex-col gap-2">
                <Badge
                  tone={verdictSwatch(verdict.verdict).hex}
                  severity={verdictSwatch(verdict.verdict).severity}
                  glyph={verdictSwatch(verdict.verdict).glyph}
                >
                  {verdictSwatch(verdict.verdict).label}
                </Badge>
                {verdict.detail ? (
                  <p className="text-[12.5px] leading-relaxed text-ink-dim">
                    {verdict.detail}
                  </p>
                ) : null}
                {verdict.violated ? (
                  <ViolationRow violated={verdict.violated} />
                ) : null}
              </div>
            ) : null}

            {step.key === "resolve" && gate && gate.status === "pending" ? (
              <div className="flex flex-col items-start gap-2.5">
                <p className="text-[13px] leading-relaxed text-ink">
                  {gate.reason ?? "Human authorization is required."}
                </p>
                <button
                  type="button"
                  onClick={() => openGate(gate.id)}
                  className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: ACCENT }}
                >
                  Review authorization
                </button>
              </div>
            ) : null}

            {step.key === "resolve" && commit ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <KeyValue label="Action" value={commit.applied_action ?? "—"} />
                <KeyValue
                  label="0G root"
                  value={shortHash(commit.zerog_root)}
                  mono
                />
                <KeyValue
                  label="Registry tx"
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
  const idle = step.state === "idle";
  const detail = Children.toArray(children);
  const hasDetail = detail.length > 0;
  const active = step.state === "active" || step.state === "blocked";

  return (
    <li className="animate-rise flex gap-3">
      <div className="flex flex-col items-center pt-[5px]">
        <span
          className={`h-[7px] w-[7px] shrink-0 rounded-full ${active ? "animate-attention" : ""}`}
          style={{
            background: idle ? "transparent" : tone,
            boxShadow: idle ? `inset 0 0 0 1.5px ${tone}` : "none",
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
        className={`flex min-w-0 flex-1 flex-col gap-1.5 ${last ? "pb-1" : "pb-5"}`}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-[12.5px] font-medium"
            style={{
              color: idle
                ? NEUTRAL.faint
                : step.state === "active" || step.state === "blocked"
                  ? tone
                  : NEUTRAL.text,
            }}
          >
            {step.label}
          </span>
          {step.ts ? (
            <span className="num text-[11.5px] text-ink-faint">
              {clock(step.ts)}
            </span>
          ) : null}
        </div>

        {hasDetail || step.headline ? (
          <div className="flex flex-col gap-2.5">
            {step.headline && !hasDetail ? (
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
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

function Confidence({ value }: { value: number }) {
  const low = value < 0.6;
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11.5px] text-ink-faint">Confidence</span>
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-hairline">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, value * 100))}%`,
            background: low ? "#c9a13f" : NEUTRAL.dim,
          }}
        />
      </span>
      <span
        className="num text-[12px]"
        style={{ color: low ? "#c9a13f" : NEUTRAL.dim }}
      >
        {pct(value)}
      </span>
    </span>
  );
}

function ViolationRow({ violated }: { violated: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-md border border-hairline bg-abyss px-2.5 py-2">
      <span className="text-[11.5px]" style={{ color: "#d1524f" }}>
        ▲ Projected breach
      </span>
      <span className="text-[12.5px] text-ink">
        {String(violated.node ?? "—")}
      </span>
      <span className="text-[12px] text-ink-dim">
        {String(violated.metric ?? "—")}
      </span>
      <span className="num text-[12.5px]" style={{ color: "#d1524f" }}>
        {num(Number(violated.value ?? 0))}
      </span>
      <span className="num text-[11.5px] text-ink-faint">
        against bound {num(Number(violated.bound ?? 0))}
      </span>
    </div>
  );
}
