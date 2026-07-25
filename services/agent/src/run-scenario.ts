import type { SupabaseClient } from "@supabase/supabase-js";
import { scenarioById, SCENARIOS, type Scenario } from "@verimesh/verifier";
import { createAdminClient } from "./db";
import { anomalyNodeOf, injectScenario } from "./scenario";
import { recordSimulatedApproval, simulationAllowed } from "./approve";

const POLL_MS = 1500;
const EXPLORER =
  process.env.REGISTRY_EXPLORER ?? "https://sepolia.basescan.org";

interface Step {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

interface ProposalRow {
  id: number;
  node_id: string;
  proposed_action: string;
  diagnosis: string;
  confidence: number;
  llm_provider: string | null;
  zerog_inference_valid: boolean | null;
  auth_tier: string | null;
  ts: number;
}

interface VerdictRow {
  proposal_id: number;
  verdict: string;
  detail: string;
}

interface GateRow {
  id: number;
  proposal_id: number;
  status: string;
  required_tier: string;
  required_quorum: number;
  operators_required: string[] | null;
  reason: string | null;
  resolved_tx_hash: string | null;
}

interface CommitRow {
  proposal_id: number;
  applied_action: string;
  zerog_root: string | null;
  chain_tx_hash: string | null;
  auth_tier: string | null;
  human_authorized: boolean;
}

const steps: Step[] = [];

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function record(name: string, ok: boolean, detail: string, started: number) {
  const step: Step = { name, ok, detail, ms: Date.now() - started };
  steps.push(step);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${detail}  (${(step.ms / 1000).toFixed(1)}s)`
  );
  return step;
}

async function waitFor<T>(
  label: string,
  timeoutMs: number,
  probe: () => Promise<T | null>
): Promise<T | null> {
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < timeoutMs) {
    const found = await probe();
    if (found) return found;
    if (!announced && Date.now() - started > 15_000) {
      console.log(`      still waiting on ${label}…`);
      announced = true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return null;
}

async function agentIsRunning(supabase: SupabaseClient): Promise<boolean> {
  const since = Date.now() - 30_000;
  const { count } = await supabase
    .from("telemetry")
    .select("ts", { count: "exact", head: true })
    .gt("ts", since);
  return (count ?? 0) > 0;
}

async function run(scenario: Scenario, timeoutMs: number): Promise<boolean> {
  const supabase = createAdminClient();
  const autoApprove = has("auto-approve");
  const anomalyNode = anomalyNodeOf(scenario) ?? "";

  console.log("");
  console.log(`${scenario.title} — ${scenario.signature}`);
  console.log(scenario.narrative);
  console.log("");

  let started = Date.now();
  const live = await agentIsRunning(supabase);
  record(
    "stack",
    live,
    live
      ? "telemetry is being written, the simulator is alive"
      : "no telemetry in the last 30s — start `pnpm --filter @verimesh/agent start`",
    started
  );
  if (!live) return false;

  started = Date.now();
  const injectedAt = Date.now();
  const { injection } = await injectScenario(supabase, scenario);
  record(
    "inject",
    Boolean(injection),
    injection
      ? `${injection.nodeId} at ${injection.power}W settles at ${injection.equilibrium.toFixed(1)}°C, over its ceiling`
      : `faults written but ${anomalyNode} has no blueprint thermal model — detection may never fire`,
    started
  );

  started = Date.now();
  const proposal = await waitFor<ProposalRow>(
    "the agent to propose",
    timeoutMs,
    async () => {
      const { data } = await supabase
        .from("proposals")
        .select(
          "id,node_id,proposed_action,diagnosis,confidence,llm_provider,zerog_inference_valid,auth_tier,ts"
        )
        .eq("node_id", anomalyNode)
        .gte("ts", injectedAt)
        .order("ts", { ascending: false })
        .limit(1);
      return ((data ?? [])[0] as ProposalRow) ?? null;
    }
  );

  if (!proposal) {
    record(
      "detect + propose",
      false,
      `no proposal for ${anomalyNode} — the detector never fired, or the LLM call failed`,
      started
    );
    return false;
  }

  record(
    "detect + propose",
    true,
    `${proposal.proposed_action} at confidence ${proposal.confidence} via ${proposal.llm_provider ?? "unknown"}${proposal.zerog_inference_valid ? " (0G attested)" : ""}`,
    started
  );

  started = Date.now();
  const verdict = await waitFor<VerdictRow>(
    "the verifier",
    60_000,
    async () => {
      const { data } = await supabase
        .from("verdicts")
        .select("proposal_id,verdict,detail")
        .eq("proposal_id", proposal.id)
        .limit(1);
      return ((data ?? [])[0] as VerdictRow) ?? null;
    }
  );

  if (!verdict) {
    record("verify", false, "no verdict row was written", started);
    return false;
  }

  record(
    "verify",
    true,
    `${verdict.verdict} — ${verdict.detail.slice(0, 110)}`,
    started
  );

  started = Date.now();
  const expectedTier = flag("expect-tier") ?? scenario.expect.tier;
  if (proposal.auth_tier === "T0_AUTONOMOUS") {
    record(
      "authorize",
      expectedTier === "T0_AUTONOMOUS",
      `T0 — no human required${expectedTier === "T0_AUTONOMOUS" ? "" : `, but the scenario expects ${expectedTier}`}`,
      started
    );
  } else {
    const gate = await waitFor<GateRow>("the freeze", 60_000, async () => {
      const { data } = await supabase
        .from("human_gates")
        .select(
          "id,proposal_id,status,required_tier,required_quorum,operators_required,reason,resolved_tx_hash"
        )
        .eq("proposal_id", proposal.id)
        .limit(1);
      return ((data ?? [])[0] as GateRow) ?? null;
    });

    if (!gate) {
      record("freeze", false, "the gate row was never opened", started);
      return false;
    }

    const tierOk = gate.required_tier === expectedTier;
    record(
      "freeze",
      tierOk,
      `${gate.required_tier}, quorum ${gate.required_quorum} of ${(gate.operators_required ?? []).join(" + ") || "no operator"}${tierOk ? "" : ` — expected ${expectedTier}`}`,
      started
    );

    started = Date.now();
    if (autoApprove) {
      if (!simulationAllowed()) {
        record(
          "authorize",
          false,
          "--auto-approve needs ALLOW_SIMULATED_APPROVALS=true",
          started
        );
        return false;
      }

      const operators =
        (gate.operators_required ?? []).length > 0
          ? (gate.operators_required as string[])
          : ["opA"];

      for (const operator of operators.slice(0, gate.required_quorum)) {
        const result = await recordSimulatedApproval(
          supabase,
          gate.id,
          operator,
          proposal.node_id,
          proposal.proposed_action
        );
        if (!result.ok) {
          record("authorize", false, `${operator}: ${result.error}`, started);
          return false;
        }
        console.log(
          `      simulated ${operator} signer ${result.nullifier.slice(0, 14)}…`
        );
      }

      record(
        "authorize",
        true,
        `${Math.min(operators.length, gate.required_quorum)} simulated signer(s) — NOT World ID proofs`,
        started
      );
    } else {
      console.log("");
      console.log(
        `      Gate ${gate.id} is open. ${gate.reason ?? ""}`
      );
      console.log(
        `      Scan World ID ${gate.required_quorum} time(s) — one distinct human per ${(gate.operators_required ?? []).join(" + ")}.`
      );
      console.log("");

      const resolved = await waitFor<GateRow>(
        "the World ID scans",
        timeoutMs,
        async () => {
          const { data } = await supabase
            .from("human_gates")
            .select(
              "id,proposal_id,status,required_tier,required_quorum,operators_required,reason,resolved_tx_hash"
            )
            .eq("id", gate.id)
            .limit(1);
          const row = (data ?? [])[0] as GateRow | undefined;
          if (!row) return null;
          return row.status === "pending" ? null : row;
        }
      );

      if (!resolved) {
        record(
          "authorize",
          false,
          `no gate resolution inside the timeout — ${gate.required_quorum} distinct scan(s) needed`,
          started
        );
        return false;
      }

      const { count } = await supabase
        .from("human_approvals")
        .select("nullifier", { count: "exact", head: true })
        .eq("gate_id", gate.id);

      record(
        "authorize",
        true,
        `${count ?? 0} distinct human(s) signed, gate ${resolved.status}`,
        started
      );
    }
  }

  started = Date.now();
  const commit = await waitFor<CommitRow>("the commit", timeoutMs, async () => {
    const { data } = await supabase
      .from("commits")
      .select(
        "proposal_id,applied_action,zerog_root,chain_tx_hash,auth_tier,human_authorized"
      )
      .eq("proposal_id", proposal.id)
      .limit(1);
    return ((data ?? [])[0] as CommitRow) ?? null;
  });

  if (!commit) {
    record("commit", false, "nothing was committed", started);
    return false;
  }

  record(
    "commit",
    true,
    `${commit.applied_action} at ${commit.auth_tier}${commit.human_authorized ? " with human authorization" : ""}`,
    started
  );

  started = Date.now();
  record(
    "on-chain",
    Boolean(commit.chain_tx_hash),
    commit.chain_tx_hash
      ? `${EXPLORER}/tx/${commit.chain_tx_hash}`
      : "no registry tx hash — the chain call failed or the registry env is unset",
    started
  );

  started = Date.now();
  record(
    "0G storage",
    Boolean(commit.zerog_root),
    commit.zerog_root
      ? `root ${commit.zerog_root}`
      : "no zerogRoot — the audit blob was not uploaded",
    started
  );

  return steps.every((step) => step.ok);
}

async function main(): Promise<void> {
  const scenarioId = process.argv[2];
  if (!scenarioId || scenarioId.startsWith("--")) {
    console.error(
      `usage: pnpm --filter @verimesh/agent run-scenario <${SCENARIOS.map((s) => s.id).join("|")}> [--auto-approve] [--timeout 300] [--expect-tier T2_QUORUM]`
    );
    process.exit(1);
  }

  const scenario = scenarioById(scenarioId);
  if (!scenario) {
    console.error(
      `unknown scenario ${scenarioId} — have ${SCENARIOS.map((s) => s.id).join(", ")}`
    );
    process.exit(1);
  }

  const timeoutMs = Number(flag("timeout") ?? 300) * 1000;
  const ok = await run(scenario, timeoutMs);

  console.log("");
  const failed = steps.filter((step) => !step.ok);
  console.log(
    ok
      ? `${steps.length} step(s) green — ${scenario.id} ran start to finish.`
      : `${failed.length} of ${steps.length} step(s) RED: ${failed.map((s) => s.name).join(", ")}`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
