"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tierSwatch, verdictSwatch, NEUTRAL } from "@/lib/palette";
import { useMeshStore } from "@/store/mesh";
import type { DemoScenario } from "@/lib/demoClient";

type Phase = "idle" | "loading" | "running" | "resetting" | "forcing";

const FORCE_NODE = "node-07";
const FORCE_ACTION = "ISOLATE_NODE";

interface InjectResult {
  ok?: boolean;
  error?: string;
  title?: string;
  node?: string | null;
  note?: string;
  blockedBy?: string;
}

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<InjectResult | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selectNode = useMeshStore((s) => s.selectNode);
  const openGate = useMeshStore((s) => s.openGate);

  useEffect(() => {
    if (!open || scenarios.length > 0) return;
    setPhase("loading");
    void fetch("/api/demo/scenario")
      .then((res) => res.json())
      .then((body: { scenarios?: DemoScenario[] }) => {
        setScenarios(body.scenarios ?? []);
      })
      .catch(() => setScenarios([]))
      .finally(() => setPhase("idle"));
  }, [open, scenarios.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inject = useCallback(
    async (scenario: DemoScenario) => {
      setPhase("running");
      setPending(scenario.id);
      setResult(null);
      try {
        const res = await fetch("/api/demo/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: scenario.id }),
        });
        const body = (await res.json()) as InjectResult;
        setResult(res.ok ? { ...body, ok: true } : { ...body, ok: false });
        if (res.ok && scenario.node) selectNode(scenario.node);
      } catch (err) {
        setResult({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setPhase("idle");
        setPending(null);
      }
    },
    [selectNode]
  );

  const force = useCallback(async () => {
    setPhase("forcing");
    setResult(null);
    try {
      const res = await fetch("/api/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: FORCE_ACTION, nodeId: FORCE_NODE }),
      });
      const body = (await res.json()) as {
        error?: string;
        gateId?: number | null;
        requirement?: { tier: string; quorum: number; reason: string };
      };
      if (!res.ok) {
        setResult({ ok: false, error: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult({
        ok: true,
        title: `${body.requirement?.tier ?? "?"} — ${body.requirement?.quorum ?? 0} distinct human(s)`,
        note: body.requirement?.reason,
        node: FORCE_NODE,
      });
      selectNode(FORCE_NODE);
      if (body.gateId) openGate(body.gateId);
      setOpen(false);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPhase("idle");
    }
  }, [openGate, selectNode]);

  const reset = useCallback(async () => {
    setPhase("resetting");
    setResult(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        gatesCancelled?: number[];
        nodesReset?: string[];
      };
      setResult(
        res.ok
          ? {
              ok: true,
              note: `mesh returned to baseline — ${(body.nodesReset ?? []).length} node(s) cleared, ${(body.gatesCancelled ?? []).length} open gate(s) cancelled`,
            }
          : { ok: false, error: body.error }
      );
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPhase("idle");
    }
  }, []);

  const busy =
    phase === "running" || phase === "resetting" || phase === "forcing";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[#c9a13f1a]"
        style={{ borderColor: "#c9a13f", color: "#c9a13f" }}
        aria-expanded={open}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${busy ? "animate-attention" : ""}`}
          style={{ background: "#c9a13f" }}
        />
        Simulate failure
      </button>

      {open ? (
        <div
          className="surface elevated animate-rise absolute top-full right-0 z-50 mt-2 flex w-[420px] flex-col overflow-hidden rounded-xl"
          role="dialog"
          aria-label="Demo controls"
        >
          <header className="flex flex-col gap-1.5 border-b border-hairline px-4 py-3">
            <span className="text-[14px] font-medium text-ink">
              Inject a fault and watch the agent handle it
            </span>
            <span className="text-[12px] leading-relaxed text-ink-faint">
              This writes a real fault into the mesh. The live agent detects it,
              reasons over 0G Compute, runs the deterministic verifier, and
              either acts alone or freezes for a human. Give it a few seconds —
              it runs on its own loop.
            </span>
            <span className="text-[12px] leading-relaxed text-ink-faint">
              The tier each scenario lists is what it was{" "}
              <span className="text-ink-dim">designed</span> to produce. The
              agent writes its own proposal every run, so a different action can
              come back with a different tier — and that is the policy working,
              not the demo failing. Use the forced action below for a guaranteed
              two-human quorum.
            </span>
          </header>

          <div className="scroll-thin flex max-h-[52vh] flex-col overflow-y-auto">
            {phase === "loading" ? (
              <span className="px-4 py-4 text-[12.5px] text-ink-faint">
                Loading scenarios…
              </span>
            ) : scenarios.length === 0 ? (
              <span className="px-4 py-4 text-[12.5px] text-ink-faint">
                No scenarios available.
              </span>
            ) : (
              scenarios.map((scenario) => (
                <ScenarioRow
                  key={scenario.id}
                  scenario={scenario}
                  busy={busy}
                  pending={pending === scenario.id}
                  onRun={() => void inject(scenario)}
                />
              ))
            )}
          </div>

          {result ? (
            <div
              className="flex flex-col gap-1 border-t border-hairline px-4 py-3"
              style={{
                background: result.ok ? "transparent" : "#d1524f0f",
              }}
            >
              <span
                className="text-[12.5px] font-medium"
                style={{ color: result.ok ? NEUTRAL.text : "#d1524f" }}
              >
                {result.ok
                  ? (result.title ?? "Done")
                  : (result.error ?? "Failed")}
              </span>
              {result.ok && result.note ? (
                <span className="text-[12px] leading-relaxed text-ink-faint">
                  {result.note}
                </span>
              ) : null}
              {result.ok && result.node ? (
                <span className="text-[12px] text-ink-faint">
                  Watch the reasoning trace — the agent runs on its own loop, so
                  give it a few seconds.
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium text-ink">
                Forced action — guaranteed two-human quorum
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void force()}
                className="ml-auto shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors hover:bg-[#c9a13f1a] disabled:opacity-40"
                style={{ borderColor: "#c9a13f", color: "#c9a13f" }}
              >
                {phase === "forcing" ? "Asking…" : `Isolate ${FORCE_NODE}`}
              </button>
            </div>
            <span className="text-[12px] leading-relaxed text-ink-faint">
              Skips the agent&rsquo;s proposal and asks the policy directly what{" "}
              <span className="data">ISOLATE_NODE</span> on {FORCE_NODE} would
              cost. Isolating it sheds load onto a neighbour belonging to a
              different operator, so the blast radius crosses an operator
              boundary and the answer is always{" "}
              <span className="text-ink-dim">T2, two distinct humans</span>. The
              row it writes is marked as a rehearsal.
            </span>
          </div>

          <div className="flex items-center gap-3 border-t border-hairline bg-abyss px-4 py-3">
            <span className="text-[12px] leading-relaxed text-ink-faint">
              Left the mesh in a stuck state? Reset returns every node to
              baseline and cancels open gates.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reset()}
              className="ml-auto shrink-0 rounded-md border border-hairline px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink disabled:opacity-40"
            >
              {phase === "resetting" ? "Resetting…" : "Reset mesh"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScenarioRow({
  scenario,
  busy,
  pending,
  onRun,
}: {
  scenario: DemoScenario;
  busy: boolean;
  pending: boolean;
  onRun: () => void;
}) {
  const tier = tierSwatch(scenario.expect.tier);
  const verdict = verdictSwatch(scenario.expect.verdict);

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-medium text-ink">
          {scenario.title}
        </span>
        {scenario.node ? (
          <span className="data text-[11.5px] text-ink-faint">
            {scenario.node}
          </span>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onRun}
          className="ml-auto shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors hover:bg-[#c9a13f1a] disabled:opacity-40"
          style={{ borderColor: "#c9a13f", color: "#c9a13f" }}
        >
          {pending ? "Injecting…" : "Inject"}
        </button>
      </div>

      <span className="text-[12px] leading-relaxed text-ink-faint">
        {scenario.signature}
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[11.5px]" style={{ color: verdict.hex }}>
          {verdict.glyph} designed for {verdict.label}
        </span>
        <span className="text-[11.5px]" style={{ color: tier.hex }}>
          {tier.glyph} {tier.label}
        </span>
        {scenario.expect.quorum > 0 ? (
          <span className="num text-[11.5px] text-ink-faint">
            {scenario.expect.quorum} human
            {scenario.expect.quorum === 1 ? "" : "s"} ·{" "}
            {scenario.expect.operators.join(" + ")}
          </span>
        ) : (
          <span className="text-[11.5px] text-ink-faint">no human needed</span>
        )}
      </div>
    </div>
  );
}
