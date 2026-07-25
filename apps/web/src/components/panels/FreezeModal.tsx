"use client";

import { useCallback, useMemo, useState } from "react";
import { distinctNullifiers } from "@verimesh/shared";
import { Overlay } from "@/components/ui/Overlay";
import { Pill } from "@/components/ui/Pill";
import {
  WorldIdScan,
  type ScanOutcome,
} from "@/components/worldid/WorldIdScan";
import { clock, num, shortHash } from "@/lib/format";
import { operatorSwatch, tierSwatch, verdictSwatch } from "@/lib/palette";
import { useMeshStore } from "@/store/mesh";
import type { ApprovalRow } from "@/lib/db";

const NO_APPROVALS: ApprovalRow[] = [];

interface Slot {
  operator: string;
  filled: boolean;
  nullifier: string | null;
  ts: number | null;
}

export function FreezeModal() {
  const activeGateId = useMeshStore((s) => s.activeGateId);
  const gate = useMeshStore((s) =>
    s.activeGateId
      ? (s.gates.find((g) => g.id === s.activeGateId) ?? null)
      : null,
  );
  const approvals = useMeshStore((s) =>
    s.activeGateId
      ? (s.approvals[s.activeGateId] ?? NO_APPROVALS)
      : NO_APPROVALS,
  );
  const proposal = useMeshStore((s) =>
    gate ? (s.proposals.find((p) => p.id === gate.proposal_id) ?? null) : null,
  );
  const verdict = useMeshStore((s) =>
    gate ? (s.verdicts[gate.proposal_id] ?? null) : null,
  );
  const nodes = useMeshStore((s) => s.nodes);
  const openGate = useMeshStore((s) => s.openGate);

  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  const slots = useMemo<Slot[]>(() => {
    if (!gate) return [];
    const required =
      gate.operators_required && gate.operators_required.length > 0
        ? gate.operators_required
        : Array.from({ length: Math.max(1, gate.required_quorum) }).map(
            (_, i) => `signer ${i + 1}`,
          );

    const pool = approvals.slice().sort((a, b) => a.ts - b.ts);
    const used = new Set<number>();

    return required.map((operator) => {
      const idx = pool.findIndex(
        (a, i) => !used.has(i) && a.operator === operator,
      );
      if (idx >= 0) {
        used.add(idx);
        return {
          operator,
          filled: true,
          nullifier: pool[idx].nullifier,
          ts: pool[idx].ts,
        };
      }
      return { operator, filled: false, nullifier: null, ts: null };
    });
  }, [gate, approvals]);

  const close = useCallback(() => {
    openGate(null);
    setOutcome(null);
  }, [openGate]);

  if (!activeGateId || !gate) return null;

  const distinct = distinctNullifiers(approvals.map((a) => a.nullifier));
  const filled = slots.filter((s) => s.filled).length;
  const satisfied =
    distinct.length >= gate.required_quorum && slots.every((s) => s.filled);
  const resolved = gate.status !== "pending";

  const tier = tierSwatch(gate.required_tier);
  const isQuorum = gate.required_tier === "T2_QUORUM";
  const node = proposal?.node_id ? nodes[proposal.node_id] : undefined;

  return (
    <Overlay onClose={close} labelledBy="freeze-modal-heading">
      <div
        className="surface animate-rise flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg"
        style={{
          borderColor: `${tier.hex}55`,
          boxShadow: `0 0 0 1px ${tier.hex}33, 0 30px 90px -20px ${tier.hex}66`,
        }}
      >
        <header
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
          style={{
            borderColor: `${tier.hex}33`,
            background: `linear-gradient(90deg, ${tier.hex}1f, transparent)`,
          }}
        >
          <span
            className="animate-pulse-dot h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: tier.hex, boxShadow: `0 0 14px ${tier.hex}` }}
          />
          <div className="flex min-w-0 flex-col">
            <h2
              id="freeze-modal-heading"
              className="text-[18px] leading-none font-bold tracking-[0.07em] whitespace-nowrap text-ink"
            >
              PHYSICAL ACTION FROZEN
            </h2>
            <span className="data mt-1 text-[11px] text-ink-faint">
              gate {gate.id} · opened {clock(gate.ts)}
            </span>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <Pill color={tier.hex} pulse={!resolved}>
              {tier.label}
            </Pill>
            <button
              type="button"
              onClick={close}
              className="data px-1 text-[18px] leading-none text-ink-faint transition-colors hover:text-ink"
              aria-label="close"
            >
              ×
            </button>
          </span>
        </header>

        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
          <Reason gate={gate} />

          <div className="grid grid-cols-2 gap-2">
            <Fact
              label="proposed action"
              value={proposal?.proposed_action ?? "—"}
            />
            <Fact
              label="target"
              value={
                (proposal?.target_nodes ?? []).join(", ") || node?.name || "—"
              }
            />
            <Fact
              label="verifier"
              value={verdict ? verdictSwatch(verdict.verdict).label : "—"}
              tone={verdict ? verdictSwatch(verdict.verdict).hex : undefined}
            />
            <Fact
              label="requires"
              value={`${gate.required_quorum} distinct human${gate.required_quorum === 1 ? "" : "s"}`}
              tone={tier.hex}
            />
          </div>

          {verdict?.violated ? <Breach violated={verdict.violated} /> : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="panel-label text-[10px]">
                {isQuorum
                  ? "cross-operator quorum · one distinct human per operator"
                  : "operator allowlist · one enrolled human"}
              </span>
              <QuorumCounter
                filled={filled}
                total={slots.length}
                distinct={distinct.length}
                tone={tier.hex}
              />
            </div>

            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(slots.length, 2)}, minmax(0,1fr))`,
              }}
            >
              {slots.map((slot, i) => (
                <SlotCard
                  key={`${slot.operator}-${i}`}
                  slot={slot}
                  tone={tier.hex}
                />
              ))}
            </div>

            <p className="text-[11px] leading-relaxed text-ink-faint">
              {isQuorum ? (
                <>
                  Each slot must be filled by a{" "}
                  <strong className="text-ink-dim">
                    different verified human
                  </strong>
                  . Distinctness is the World ID nullifier — the same person
                  scanning twice is rejected here, by the unique index in
                  Postgres, and by{" "}
                  <span className="data">DuplicateNullifier</span> on the
                  registry contract.
                </>
              ) : (
                <>
                  World ID proves this is{" "}
                  <strong className="text-ink-dim">a</strong> unique human; the
                  operator allowlist proves it is{" "}
                  <strong className="text-ink-dim">the right one</strong>. Both
                  are checked.
                </>
              )}
            </p>
          </section>

          {outcome && !outcome.ok ? <Rejection outcome={outcome} /> : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-hairline bg-abyss px-4 py-3">
          {satisfied || resolved ? (
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2.5"
              style={{ borderColor: "#34d39955", background: "#34d39912" }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "#34d399", boxShadow: "0 0 10px #34d399" }}
              />
              <span
                className="data text-[12px] font-semibold"
                style={{ color: "#34d399" }}
              >
                {distinct.length} distinct human
                {distinct.length === 1 ? "" : "s"} authorized — releasing to
                commit
              </span>
              <button
                type="button"
                onClick={close}
                className="data ml-auto text-[11px] text-ink-faint transition-colors hover:text-ink"
              >
                dismiss
              </button>
            </div>
          ) : (
            <>
              <WorldIdScan
                gateId={gate.id}
                chosenAction={proposal?.proposed_action ?? undefined}
                label={
                  filled === 0
                    ? "scan to authorize"
                    : `scan as ${slots.find((s) => !s.filled)?.operator ?? "the second operator"}`
                }
                onOutcome={setOutcome}
              />
              <p className="data text-center text-[10px] text-ink-faint">
                the agent cannot proceed until this is satisfied
              </p>
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function Reason({
  gate,
}: {
  gate: { reason: string | null; operators_required: string[] | null };
}) {
  const operators = gate.operators_required ?? [];
  const text =
    gate.reason ?? "Human authorization is required for this action.";

  const parts = useMemo(() => {
    if (operators.length === 0)
      return [{ text, operator: null as string | null }];
    const pattern = new RegExp(`(${operators.join("|")})`, "g");
    return text
      .split(pattern)
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => ({
        text: chunk,
        operator: operators.includes(chunk) ? chunk : null,
      }));
  }, [text, operators]);

  return (
    <p className="text-[14.5px] leading-relaxed text-ink">
      {parts.map((part, i) =>
        part.operator ? (
          <strong
            key={i}
            className="data font-semibold"
            style={{ color: operatorSwatch(part.operator).hex }}
          >
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function QuorumCounter({
  filled,
  total,
  distinct,
  tone,
}: {
  filled: number;
  total: number;
  distinct: number;
  tone: string;
}) {
  const complete = filled >= total;
  return (
    <span
      className="data text-[12px] font-semibold whitespace-nowrap"
      style={{ color: complete ? "#34d399" : tone }}
    >
      {filled} of {total} authorized
      {distinct !== filled ? (
        <span className="ml-1.5 text-[10px] text-ink-faint">
          ({distinct} distinct)
        </span>
      ) : null}
    </span>
  );
}

function SlotCard({ slot, tone }: { slot: Slot; tone: string }) {
  const op = operatorSwatch(slot.operator);
  const accent = slot.filled ? "#34d399" : tone;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border px-3 py-2.5 transition-colors"
      style={{
        borderColor: slot.filled ? "#34d39955" : "#2b364d",
        background: slot.filled ? "#34d3990f" : "#080b14",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-[11px] leading-none font-bold ${
            slot.filled ? "" : "animate-pulse-dot"
          }`}
          style={{
            borderColor: accent,
            color: accent,
            background: slot.filled ? `${accent}22` : "transparent",
          }}
        >
          {slot.filled ? "✓" : ""}
        </span>
        <span
          className="data text-[13px] font-semibold"
          style={{ color: op.hex }}
        >
          {slot.operator}
        </span>
        <span className="ml-auto">
          {slot.filled ? (
            <Pill color="#34d399">authorized</Pill>
          ) : (
            <Pill color={tone} pulse>
              awaiting scan
            </Pill>
          )}
        </span>
      </div>

      {slot.filled ? (
        <div className="flex flex-col gap-0.5">
          <span className="panel-label text-[8px]">nullifier</span>
          <span
            className="data truncate text-[10.5px]"
            title={slot.nullifier ?? undefined}
          >
            {shortHash(slot.nullifier, 8)}
          </span>
          <span className="data text-[9px] text-ink-faint">
            {clock(slot.ts)}
          </span>
        </div>
      ) : (
        <span className="data text-[10.5px] text-ink-faint">
          needs an enrolled {slot.operator} human
        </span>
      )}
    </div>
  );
}

function Breach({ violated }: { violated: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-[#f43f5e33] bg-[#f43f5e0d] px-3 py-2">
      <span className="panel-label text-[9px]" style={{ color: "#f43f5e" }}>
        projected breach
      </span>
      <span className="data text-[12.5px] text-ink">
        {String(violated.node ?? "—")}
      </span>
      <span className="data text-[11px] text-ink-dim">
        {String(violated.metric ?? "—")}
      </span>
      <span className="data text-[12.5px]" style={{ color: "#f43f5e" }}>
        {num(Number(violated.value ?? 0))}
      </span>
      <span className="data text-[10px] text-ink-faint">
        against bound {num(Number(violated.bound ?? 0))}
      </span>
    </div>
  );
}

function Rejection({ outcome }: { outcome: ScanOutcome }) {
  const duplicate = outcome.rejection === "DUPLICATE_NULLIFIER";
  const tone = duplicate ? "#fbbf24" : "#f43f5e";

  return (
    <div
      className="flex flex-col gap-1 rounded-md border px-3 py-2"
      style={{ borderColor: `${tone}55`, background: `${tone}0f` }}
    >
      <span
        className="data text-[11px] font-semibold tracking-wide"
        style={{ color: tone }}
      >
        {duplicate
          ? "REJECTED — SAME HUMAN CANNOT COUNT TWICE"
          : outcome.rejection === "NOT_ON_ALLOWLIST"
            ? "REJECTED — NOT ON THIS OPERATOR'S ALLOWLIST"
            : "SCAN REJECTED"}
      </span>
      <span className="text-[11.5px] leading-snug text-ink-dim">
        {outcome.error}
      </span>
      {outcome.nullifier ? (
        <span className="data text-[10px] text-ink-faint">
          nullifier {shortHash(outcome.nullifier, 8)}
          {outcome.enrolledFor && outcome.enrolledFor.length > 0
            ? ` · enrolled to ${outcome.enrolledFor.join(", ")}`
            : " · not enrolled to any operator"}
        </span>
      ) : null}
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-hairline bg-abyss px-2.5 py-1.5">
      <span className="panel-label text-[8.5px]">{label}</span>
      <span
        className="data truncate text-[12.5px] font-semibold"
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
      </span>
    </div>
  );
}
