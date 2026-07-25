"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IDKitRequestWidget,
  orbLegacy,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { ACCENT } from "@/lib/palette";

interface SignPayload {
  configured: boolean;
  app_id?: string;
  action?: string;
  rp_context?: RpContext;
  error?: string;
}

export interface ScanOutcome {
  ok: boolean;
  error?: string;
  rejection?: string;
  nullifier?: string;
  operator?: string;
  enrolledFor?: string[];
  selfEnrolled?: boolean;
  collected?: number;
  requiredQuorum?: number;
  satisfied?: boolean;
}

type Phase =
  | "idle"
  | "signing"
  | "ready"
  | "scanning"
  | "verifying"
  | "unavailable";

export function WorldIdScan({
  gateId,
  chosenAction,
  label = "Scan to authorize",
  disabled = false,
  onOutcome,
}: {
  gateId: number;
  chosenAction?: string;
  label?: string;
  disabled?: boolean;
  onOutcome?: (outcome: ScanOutcome) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [config, setConfig] = useState<SignPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setPhase("idle");
    setConfig(null);
    setOpen(false);
    setProblem(null);
  }, [gateId]);

  const start = useCallback(async () => {
    setPhase("signing");
    setProblem(null);
    try {
      const res = await fetch("/api/worldid/sign", { method: "POST" });
      const body = (await res.json()) as SignPayload;
      if (!res.ok || !body.rp_context || !body.app_id) {
        setPhase("unavailable");
        setProblem(body.error ?? `Sign route returned HTTP ${res.status}`);
        return;
      }
      setConfig(body);
      setPhase("ready");
      setOpen(true);
    } catch (err) {
      setPhase("unavailable");
      setProblem(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleVerify = useCallback(
    async (result: IDKitResult) => {
      setPhase("verifying");
      const res = await fetch("/api/worldid/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rp_id: config?.rp_context?.rp_id,
          gateId,
          chosenAction,
          idkitResponse: result,
        }),
      });
      const outcome = (await res.json()) as ScanOutcome;
      onOutcome?.(outcome);
      if (!res.ok || !outcome.ok) {
        setPhase("ready");
        setProblem(outcome.error ?? `Verification failed (HTTP ${res.status})`);
        throw new Error(outcome.error ?? "verification failed");
      }
      setPhase("idle");
      setProblem(null);
    },
    [config, gateId, chosenAction, onOutcome]
  );

  const appId = config?.app_id;
  const canRender =
    phase !== "idle" &&
    phase !== "unavailable" &&
    Boolean(config?.rp_context) &&
    Boolean(appId?.startsWith("app_"));

  const busy = phase === "signing" || phase === "verifying";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void start()}
        className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        <WorldMark />
        {phase === "signing"
          ? "Requesting signed context…"
          : phase === "verifying"
            ? "Verifying proof…"
            : label}
      </button>

      {phase === "unavailable" ? (
        <p className="text-[12px] leading-relaxed" style={{ color: "#c9a13f" }}>
          World ID is not configured: {problem}
        </p>
      ) : problem ? (
        <p className="text-[12px] leading-relaxed" style={{ color: "#d1524f" }}>
          {problem}
        </p>
      ) : null}

      {canRender && config?.rp_context && appId ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={appId as `app_${string}`}
          action={config.action ?? "verimesh-authorize"}
          rp_context={config.rp_context}
          allow_legacy_proofs
          preset={orbLegacy({ signal: `gate-${gateId}` })}
          handleVerify={handleVerify}
          onSuccess={() => {
            setOpen(false);
            setPhase("idle");
          }}
          onError={(code) => {
            setPhase("ready");
            setProblem(`IDKit error: ${code}`);
          }}
        />
      ) : null}
    </div>
  );
}

function WorldMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.2 11h17.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
