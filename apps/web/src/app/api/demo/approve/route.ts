import { NextResponse } from "next/server";
import {
  checkApproval,
  distinctNullifiers,
  type ApprovalRejection,
  type AuthTier,
  type AuthorizationRequirement,
  type HumanApproval,
} from "@verimesh/shared";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEMO_OFF,
  SIMULATION_OFF,
  demoModeOn,
  demoSignerFor,
  liveAuthzConfig,
  simulationAllowed,
} from "@/lib/demo";

export const dynamic = "force-dynamic";

const REJECTION_STATUS: Record<ApprovalRejection, number> = {
  DUPLICATE_HUMAN: 409,
  NOT_ON_ALLOWLIST: 403,
  BUDGET_EXCEEDED: 403,
  OPERATOR_NOT_REQUIRED: 403,
};

interface Body {
  gateId?: number;
  operator?: string;
}

interface GateRecord {
  id: number;
  proposal_id: number;
  status: string;
  required_tier: AuthTier;
  required_quorum: number;
  operators_required: string[] | null;
  reason: string | null;
}

interface ApprovalRecord {
  nullifier: string;
  operator: string;
  chosen_action: string | null;
  ts: number;
}

function rejectionMessage(
  rejection: ApprovalRejection,
  operator: string
): string {
  if (rejection === "DUPLICATE_HUMAN") {
    return `the ${operator} demo signer has already authorized this decision — one human fills one slot, simulated or not`;
  }
  if (rejection === "NOT_ON_ALLOWLIST") {
    return `the ${operator} demo signer is not enrolled to ${operator} — set DEMO_SIGNER_NULLIFIERS, or leave it unset to use the derived default`;
  }
  if (rejection === "BUDGET_EXCEEDED") {
    return `the ${operator} demo signer has used its override budget for this window`;
  }
  return `${operator} is not one of the operators this gate requires`;
}

export async function POST(request: Request) {
  if (!demoModeOn()) {
    return NextResponse.json({ ok: false, error: DEMO_OFF }, { status: 403 });
  }
  if (!simulationAllowed()) {
    return NextResponse.json(
      { ok: false, error: SIMULATION_OFF },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: ADMIN_MISSING }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (body.gateId === undefined || body.gateId === null) {
    return NextResponse.json(
      { ok: false, error: "gateId is required" },
      { status: 400 }
    );
  }

  const { data: gate, error: gateError } = await supabase
    .from("human_gates")
    .select(
      "id,proposal_id,status,required_tier,required_quorum,operators_required,reason"
    )
    .eq("id", body.gateId)
    .maybeSingle<GateRecord>();

  if (gateError) {
    return NextResponse.json(
      { ok: false, error: gateError.message },
      { status: 500 }
    );
  }
  if (!gate) {
    return NextResponse.json(
      { ok: false, error: `unknown gate ${body.gateId}` },
      { status: 404 }
    );
  }
  if (gate.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `gate ${gate.id} is already ${gate.status}` },
      { status: 409 }
    );
  }

  const { data: proposal } = await supabase
    .from("proposals")
    .select("node_id,proposed_action")
    .eq("id", gate.proposal_id)
    .maybeSingle<{ node_id: string | null; proposed_action: string | null }>();

  const required = gate.operators_required ?? [];

  const { data: existing, error: existingError } = await supabase
    .from("human_approvals")
    .select("nullifier,operator,chosen_action,ts")
    .eq("gate_id", gate.id);

  if (existingError) {
    return NextResponse.json(
      { ok: false, error: existingError.message },
      { status: 500 }
    );
  }

  const priorRows = (existing ?? []) as ApprovalRecord[];
  const takenOperators = new Set(priorRows.map((r) => r.operator));

  const operator =
    body.operator ??
    required.find((op) => !takenOperators.has(op)) ??
    required[0] ??
    "opA";

  const { config, signers } = liveAuthzConfig(
    required.length > 0 ? required : [operator]
  );

  const nullifier = demoSignerFor(signers, operator);
  if (!nullifier) {
    return NextResponse.json(
      {
        ok: false,
        error: `no demo signer is configured for ${operator} — add it to DEMO_SIGNER_NULLIFIERS`,
      },
      { status: 500 }
    );
  }

  const chosenAction = proposal?.proposed_action ?? "NO_OP";
  const ts = Date.now();

  const requirement: AuthorizationRequirement = {
    tier: gate.required_tier,
    quorum: gate.required_quorum,
    operatorsRequired: required,
    reason: gate.reason ?? "",
  };

  const collected: HumanApproval[] = priorRows.map((row) => ({
    nullifier: row.nullifier,
    operator: row.operator,
    chosenAction: row.chosen_action ?? "",
    ts: Number(row.ts),
  }));

  const candidate: HumanApproval = {
    nullifier,
    operator,
    chosenAction,
    ts,
  };

  const check = checkApproval(requirement, collected, candidate, config, {
    incidentCount: 0,
    overrideCounts: {},
  });

  if (!check.accepted && check.rejection) {
    return NextResponse.json(
      {
        ok: false,
        simulated: true,
        rejection:
          check.rejection === "DUPLICATE_HUMAN"
            ? "DUPLICATE_NULLIFIER"
            : check.rejection,
        error: rejectionMessage(check.rejection, operator),
        nullifier,
        operator,
      },
      { status: REJECTION_STATUS[check.rejection] }
    );
  }

  const { error: insertError } = await supabase.from("human_approvals").insert({
    gate_id: gate.id,
    nullifier,
    operator,
    chosen_action: chosenAction,
    ts,
  });

  if (insertError) {
    const duplicate = insertError.code === "23505";
    return NextResponse.json(
      {
        ok: false,
        simulated: true,
        rejection: duplicate ? "DUPLICATE_NULLIFIER" : undefined,
        error: duplicate
          ? `the ${operator} demo signer has already authorized this decision — the unique index rejected it`
          : insertError.message,
        nullifier,
        operator,
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  const distinct = distinctNullifiers([
    ...priorRows.map((r) => r.nullifier),
    nullifier,
  ]);
  const operatorsCovered = new Set([...takenOperators, operator]);
  const satisfied =
    distinct.length >= gate.required_quorum &&
    required.every((op) => operatorsCovered.has(op));

  await supabase.from("events").insert({
    ts,
    type: "approval",
    node_id: proposal?.node_id ?? null,
    message: `SIMULATED signer authorized gate ${gate.id} as ${operator} — not a World ID scan — ${distinct.length} of ${gate.required_quorum} distinct signer${gate.required_quorum === 1 ? "" : "s"}`,
  });

  if (satisfied) {
    await supabase
      .from("human_gates")
      .update({ status: "authorized", chosen_action: chosenAction })
      .eq("id", gate.id);

    await supabase.from("events").insert({
      ts: ts + 1,
      type: "override",
      node_id: proposal?.node_id ?? null,
      message: `gate ${gate.id} satisfied by ${distinct.length} SIMULATED signer${distinct.length === 1 ? "" : "s"} across ${[...operatorsCovered].join(" + ")} — no personhood was proven`,
    });
  }

  return NextResponse.json({
    ok: true,
    simulated: true,
    recorded: true,
    nullifier,
    operator,
    collected: distinct.length,
    requiredQuorum: gate.required_quorum,
    operatorsRequired: required,
    operatorsCovered: [...operatorsCovered],
    satisfied,
    chosenAction,
  });
}
