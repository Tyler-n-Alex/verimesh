"use client";

import { useCallback, useMemo, useState } from "react";
import { distinctNullifiers } from "@verimesh/shared";
import { Overlay } from "@/components/ui/Overlay";
import { Badge, KeyValue } from "@/components/ui/Pill";
import { WorldIdScan, type ScanOutcome } from "@/components/worldid/WorldIdScan";
import { clock, num, shortHash } from "@/lib/format";
import { ACCENT, NEUTRAL, tierSwatch, verdictSwatch } from "@/lib/palette";
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
      : null
  );
  const approvals = useMeshStore((s) =>
    s.activeGateId
      ? (s.approvals[s.activeGateId] ?? NO_APPROVALS)
      : NO_APPROVALS
  );
  const proposal = useMeshStore((s) =>
    gate ? (s.proposals.find((p) => p.id === gate.proposal_id) ?? null) : null
  );
  const verdict = useMeshStore((s) =>
    gate ? (s.verdicts[gate.proposal_id] ?? null) : null
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
            (_, i) => `Signer ${i + 1}`
          );

    const pool = approvals.slice().sort((a, b) => a.ts - b.ts);
    const used = new Set<number>();

    return required.map((operator) => {
      const idx = pool.findIndex(
        (a, i) => !used.has(i) && a.operator === operator
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
  const done = satisfied || resolved;

  return (
    <Overlay onClose={close} labelledBy="freeze-modal-heading">
      <div className="surface elevated animate-rise flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2
              id="freeze-modal-heading"
              className="text-[17px] leading-none font-medium whitespace-nowrap text-ink"
            >
              Action frozen — human authorization required
            </h2>
            <span className="num text-[12px] text-ink-faint">
              Gate {gate.id} · opened {clock(gate.ts)}
            </span>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-2.5">
            <Badge tone={tier.hex} severity={tier.severity} glyph={tier.glyph}>
              {tier.label}
            </Badge>
            <button
              type="button"
              onClick={close}
              className="rounded px-1 text-[17px] leading-none text-ink-faint transition-colors hover:text-ink"
              aria-label="Close"
            >
              ×
            </button>
          </span>
        </header>

        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <Reason gate={gate} />

          <div className="grid grid-cols-4 gap-x-5 gap-y-3">
            <KeyValue
              label="Proposed action"
              value={proposal?.proposed_action ?? "—"}
            />
            <KeyValue
              label="Target"
              value={
                (proposal?.target_nodes ?? []).join(", ") || node?.name || "—"
              }
            />
            <KeyValue
              label="Verifier"
              value={verdict ? verdictSwatch(verdict.verdict).label : "—"}
              tone={verdict ? verdictSwatch(verdict.verdict).hex : undefined}
            />
            <KeyValue
              label="Requires"
              value={`${gate.required_quorum} distinct human${gate.required_quorum === 1 ? "" : "s"}`}
            />
          </div>

          {verdict?.violated ? <Breach violated={verdict.violated} /> : null}

          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[12.5px] font-medium text-ink-faint">
                {isQuorum
                  ? "Cross-operator quorum · one distinct human per operator"
                  : "Operator allowlist · one enrolled human"}
              </h3>
              <span
                className="num text-[13px] font-medium whitespace-nowrap"
                style={{ color: done ? NEUTRAL.text : tier.hex }}
              >
                {filled} of {slots.length} authorized
              </span>
            </div>

            <div
              className="grid gap-2.5"
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

            <p className="text-[12.5px] leading-relaxed text-ink-faint">
              {isQuorum ? (
                <>
                  Each slot must be filled by a{" "}
                  <span className="text-ink-dim">different verified human</span>.
                  Distinctness is the World ID nullifier — the same person
                  scanning twice is rejected here, by the unique index in
                  Postgres, and by <span className="data">DuplicateNullifier</span>{" "}
                  on the registry contract.
                </>
              ) : (
                <>
                  World ID proves this is{" "}
                  <span className="text-ink-dim">a</span> unique human; the
                  operator allowlist proves it is{" "}
                  <span className="text-ink-dim">the right one</span>. Both are
                  checked.
                </>
              )}
            </p>
          </section>

          {outcome && !outcome.ok ? <Rejection outcome={outcome} /> : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-hairline bg-abyss px-5 py-4">
          {done ? (
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] text-ink">
                {distinct.length} distinct human
                {distinct.length === 1 ? "" : "s"} authorized — releasing to
                commit.
              </span>
              <button
                type="button"
                onClick={close}
                className="ml-auto rounded-md border border-hairline px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <>
              <WorldIdScan
                gateId={gate.id}
                chosenAction={proposal?.proposed_action ?? undefined}
                label={
                  filled === 0
                    ? "Scan to authorize"
                    : `Scan as ${slots.find((s) => !s.filled)?.operator ?? "the second operator"}`
                }
                onOutcome={setOutcome}
              />
              <p className="text-center text-[12px] text-ink-faint">
                The agent cannot proceed until this is satisfied.
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
  const text = gate.reason ?? "Human authorization is required for this action.";

  const parts = useMemo(() => {
    if (operators.length === 0) return [{ text, operator: null as string | null }];
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
    <p className="text-[15px] leading-relaxed text-ink">
      {parts.map((part, i) =>
        part.operator ? (
          <span key={i} className="inline-flex items-baseline gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 translate-y-[-1px] rounded-[2px]"
              style={{
                background: `var(--${part.operator.toLowerCase()}, ${NEUTRAL.faint})`,
              }}
            />
            <span className="font-medium">{part.text}</span>
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  );
}

function SlotCard({ slot, tone }: { slot: Slot; tone: string }) {
  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: slot.filled ? NEUTRAL.lineBright : NEUTRAL.line,
        background: slot.filled ? NEUTRAL.raised : "transparent",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none ${
            slot.filled ? "" : "animate-attention"
          }`}
          style={{
            borderColor: slot.filled ? NEUTRAL.text : tone,
            color: slot.filled ? NEUTRAL.text : tone,
          }}
        >
          {slot.filled ? "✓" : ""}
        </span>
        <span className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-[2px]"
            style={{
              background: `var(--${slot.operator.toLowerCase()}, ${NEUTRAL.faint})`,
            }}
          />
          {slot.operator}
        </span>
        <span className="ml-auto text-[12px] text-ink-faint">
          {slot.filled ? "Authorized" : "Awaiting scan"}
        </span>
      </div>

      {slot.filled ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] text-ink-faint">Nullifier</span>
          <span
            className="data truncate text-[11.5px] text-ink-dim"
            title={slot.nullifier ?? undefined}
          >
            {shortHash(slot.nullifier, 8)}
          </span>
          <span className="num text-[11.5px] text-ink-faint">
            {clock(slot.ts)}
          </span>
        </div>
      ) : (
        <span className="text-[12px] text-ink-faint">
          Needs an enrolled {slot.operator} human.
        </span>
      )}
    </div>
  );
}

function Breach({ violated }: { violated: Record<string, unknown> }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5"
      style={{ borderColor: "#d1524f40", background: "#d1524f0f" }}
    >
      <span className="text-[12.5px]" style={{ color: "#d1524f" }}>
        ▲ Projected breach
      </span>
      <span className="text-[13px] text-ink">
        {String(violated.node ?? "—")}
      </span>
      <span className="text-[12.5px] text-ink-dim">
        {String(violated.metric ?? "—")}
      </span>
      <span className="num text-[13px]" style={{ color: "#d1524f" }}>
        {num(Number(violated.value ?? 0))}
      </span>
      <span className="num text-[12px] text-ink-faint">
        against bound {num(Number(violated.bound ?? 0))}
      </span>
    </div>
  );
}

function Rejection({ outcome }: { outcome: ScanOutcome }) {
  const duplicate = outcome.rejection === "DUPLICATE_NULLIFIER";
  const tone = duplicate ? "#c9a13f" : "#d1524f";

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5"
      style={{ borderColor: `${tone}40`, background: `${tone}0f` }}
    >
      <span className="text-[13px] font-medium" style={{ color: tone }}>
        {duplicate
          ? "Rejected — the same human cannot count twice"
          : outcome.rejection === "NOT_ON_ALLOWLIST"
            ? "Rejected — not on this operator's allowlist"
            : "Scan rejected"}
      </span>
      <span className="text-[12.5px] leading-relaxed text-ink-dim">
        {outcome.error}
      </span>
      {outcome.nullifier ? (
        <span className="data text-[11.5px] text-ink-faint">
          {shortHash(outcome.nullifier, 8)}
          {outcome.enrolledFor && outcome.enrolledFor.length > 0
            ? ` · enrolled to ${outcome.enrolledFor.join(", ")}`
            : " · not enrolled to any operator"}
        </span>
      ) : null}
    </div>
  );
}
