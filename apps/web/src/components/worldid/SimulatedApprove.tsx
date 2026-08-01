"use client";

import { useCallback, useEffect, useState } from "react";
import { shortHash } from "@/lib/format";
import type { DemoApproveOutcome } from "@/lib/demoClient";

type Phase = "idle" | "sending";

export function SimulatedApprove({
  gateId,
  operator,
  label = "Approve as this operator",
  hint,
  variant = "primary",
  disabled = false,
  onOutcome,
}: {
  gateId: number;
  operator?: string;
  label?: string;
  hint?: string;
  variant?: "primary" | "quiet";
  disabled?: boolean;
  onOutcome?: (outcome: DemoApproveOutcome) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [signer, setSigner] = useState<string | null>(null);

  useEffect(() => {
    setPhase("idle");
    setProblem(null);
    setSigner(null);
  }, [gateId]);

  const approve = useCallback(async () => {
    setPhase("sending");
    setProblem(null);
    try {
      const res = await fetch("/api/demo/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operator ? { gateId, operator } : { gateId }),
      });
      const outcome = (await res.json()) as DemoApproveOutcome;
      onOutcome?.(outcome);
      if (!res.ok || !outcome.ok) {
        setProblem(outcome.error ?? `Approval failed (HTTP ${res.status})`);
        setSigner(outcome.nullifier ?? null);
      } else {
        setSigner(outcome.nullifier ?? null);
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase("idle");
    }
  }, [gateId, operator, onOutcome]);

  const quiet = variant === "quiet";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || phase === "sending"}
        onClick={() => void approve()}
        className={
          quiet
            ? "rounded-md border border-hairline px-4 py-2 text-[12.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            : "flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-[#c9a13f1a] disabled:cursor-not-allowed disabled:opacity-50"
        }
        style={quiet ? undefined : { borderColor: "#c9a13f", color: "#c9a13f" }}
      >
        {quiet ? null : <SimMark />}
        {phase === "sending" ? "Recording…" : label}
      </button>

      {hint ? (
        <p className="text-[12px] leading-relaxed text-ink-faint">{hint}</p>
      ) : (
        <p className="text-[12px] leading-relaxed text-ink-faint">
          <span style={{ color: "#c9a13f" }}>Simulated approval.</span> This
          fabricates a deterministic signer for{" "}
          <span className="text-ink-dim">
            {operator ?? "the next open slot"}
          </span>{" "}
          instead of verifying a World ID proof. It proves{" "}
          <span className="text-ink-dim">nothing</span> about personhood — it
          exists so the freeze, the quorum and the on-chain commit can be walked
          through from anywhere. Every one is written to the event log as{" "}
          <span className="data">SIMULATED</span>. The real path is a World ID
          Orb scan, and the same distinctness rules apply here: one signer fills
          one slot.
        </p>
      )}

      {signer && !quiet ? (
        <span className="data text-[11.5px] text-ink-faint">
          signer {shortHash(signer, 8)}
        </span>
      ) : null}

      {problem ? (
        <p className="text-[12px] leading-relaxed" style={{ color: "#d1524f" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function SimMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="3 2.6"
      />
      <path d="M8.4 12.2l2.6 2.6 4.6-5.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
