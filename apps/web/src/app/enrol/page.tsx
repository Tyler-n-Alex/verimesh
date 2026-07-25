"use client";

import { useCallback, useState } from "react";
import { WorldIdScan, type ScanOutcome } from "@/components/worldid/WorldIdScan";
import { ACCENT, NEUTRAL } from "@/lib/palette";

const OPERATORS = ["opA", "opB", "opC"];

export default function EnrolPage() {
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [operator, setOperator] = useState("opA");
  const [copied, setCopied] = useState(false);

  const command = outcome?.nullifier
    ? `pnpm --filter @verimesh/agent enrol ${operator} ${outcome.nullifier}`
    : "";

  const copy = useCallback(async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [command]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[22px] leading-tight font-medium text-ink">
          Enrol a World ID human
        </h1>
        <p className="text-[14px] leading-relaxed text-ink-dim">
          This scan authorizes nothing. It verifies a proof and returns the
          canonical nullifier so an operator allowlist can be built from it.
          Nothing is written to any gate.
        </p>
      </header>

      <section className="surface flex flex-col gap-4 rounded-lg px-5 py-5">
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-ink-faint">
            Enrol the scanner as
          </span>
          <div className="flex gap-2">
            {OPERATORS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setOperator(op)}
                className="rounded-md border px-3 py-1.5 text-[13px] transition-colors"
                style={{
                  borderColor: operator === op ? ACCENT : NEUTRAL.line,
                  color: operator === op ? ACCENT : NEUTRAL.dim,
                }}
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        <WorldIdScan label="Scan to read this human's nullifier" onOutcome={setOutcome} />
      </section>

      {outcome?.nullifier ? (
        <section className="surface flex flex-col gap-4 rounded-lg px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-ink-faint">Nullifier</span>
            <span className="data text-[13px] break-all text-ink">
              {outcome.nullifier}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-ink-faint">
              Already enrolled to
            </span>
            <span className="text-[13px] text-ink-dim">
              {outcome.enrolledFor && outcome.enrolledFor.length > 0
                ? outcome.enrolledFor.join(", ")
                : "no operator — this human cannot authorize anything yet"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] text-ink-faint">
              Run this at the repo root
            </span>
            <code className="data rounded-md border border-hairline px-3 py-2.5 text-[12.5px] break-all text-ink">
              {command}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="self-start rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: ACCENT }}
            >
              {copied ? "Copied" : "Copy command"}
            </button>
            <p className="text-[12.5px] leading-relaxed text-ink-faint">
              The allowlist is read from disk on every verification, so the
              enrolment takes effect immediately — no dev-server restart.
              <br />
              Equivalent, without copying anything:{" "}
              <span className="data">
                pnpm --filter @verimesh/agent enrol --last {operator}
              </span>
            </p>
          </div>
        </section>
      ) : outcome && !outcome.ok ? (
        <section
          className="flex flex-col gap-1.5 rounded-lg border px-5 py-4"
          style={{ borderColor: "#d1524f40", background: "#d1524f0f" }}
        >
          <span className="text-[13px] font-medium" style={{ color: "#d1524f" }}>
            Scan rejected
          </span>
          <span className="text-[12.5px] text-ink-dim">{outcome.error}</span>
        </section>
      ) : null}

      <p className="text-[12px] leading-relaxed text-ink-faint">
        A nullifier is fixed for a given human against this relying party and
        action. Change <span className="data">WORLDID_RP_ID</span> or{" "}
        <span className="data">WORLDID_ACTION</span> after enrolling and every
        enrolled value stops matching, silently.
      </p>
    </main>
  );
}
