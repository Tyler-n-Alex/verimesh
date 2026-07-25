import { NextResponse } from "next/server";
import {
  authzConfig,
  distinctNullifiers,
  normalizeNullifier,
  type AuthTier,
} from "@verimesh/shared";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const VERIFY_BASE = "https://developer.world.org/api/v4/verify";

interface VerifyBody {
  rp_id?: string;
  gateId?: number;
  chosenAction?: string;
  idkitResponse?: unknown;
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
}

function operatorsForNullifier(nullifier: string): string[] {
  const operators = (authzConfig as { operators: Record<string, string[]> })
    .operators;
  const matches: string[] = [];
  for (const [operator, enrolled] of Object.entries(operators)) {
    for (const candidate of enrolled) {
      let normalized: string;
      try {
        normalized = normalizeNullifier(candidate);
      } catch {
        continue;
      }
      if (normalized === nullifier) {
        matches.push(operator);
        break;
      }
    }
  }
  return matches;
}

function allowlistIsEmpty(): boolean {
  const operators = (authzConfig as { operators: Record<string, string[]> })
    .operators;
  return Object.values(operators).every((list) => list.length === 0);
}

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const rpId = body.rp_id ?? process.env.WORLDID_RP_ID;
  if (!rpId) {
    return NextResponse.json(
      { ok: false, error: "rp_id missing and WORLDID_RP_ID is not set" },
      { status: 400 }
    );
  }
  if (!body.idkitResponse) {
    return NextResponse.json(
      { ok: false, error: "idkitResponse is required" },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${VERIFY_BASE}/${rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body.idkitResponse),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `could not reach the World verifier: ${message}` },
      { status: 502 }
    );
  }

  const rawText = await upstream.text();
  let verified: { nullifier?: string; detail?: string; code?: string } = {};
  try {
    verified = rawText ? (JSON.parse(rawText) as typeof verified) : {};
  } catch {
    verified = {};
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          verified.detail ??
          verified.code ??
          `World verifier rejected the proof (HTTP ${upstream.status})`,
      },
      { status: 400 }
    );
  }

  if (!verified.nullifier) {
    return NextResponse.json(
      { ok: false, error: "verifier returned no nullifier" },
      { status: 400 }
    );
  }

  let nullifier: string;
  try {
    nullifier = normalizeNullifier(verified.nullifier);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `unusable nullifier: ${message}` },
      { status: 400 }
    );
  }

  const enrolledFor = operatorsForNullifier(nullifier);
  const selfEnroll =
    process.env.WORLDID_ALLOW_SELF_ENROLL === "true" || allowlistIsEmpty();

  if (body.gateId === undefined || body.gateId === null) {
    return NextResponse.json({
      ok: true,
      nullifier,
      enrolledFor,
      recorded: false,
      note: "proof verified; no gateId supplied so nothing was recorded",
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: ADMIN_MISSING, nullifier },
      { status: 500 }
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
      { ok: false, error: gateError.message, nullifier },
      { status: 500 }
    );
  }
  if (!gate) {
    return NextResponse.json(
      { ok: false, error: `unknown gate ${body.gateId}`, nullifier },
      { status: 404 }
    );
  }
  if (gate.status !== "pending") {
    return NextResponse.json(
      {
        ok: false,
        error: `gate ${gate.id} is already ${gate.status}`,
        nullifier,
        enrolledFor,
      },
      { status: 409 }
    );
  }

  const required = gate.operators_required ?? [];
  const eligible = required.filter((op) => enrolledFor.includes(op));

  if (eligible.length === 0 && !selfEnroll) {
    return NextResponse.json(
      {
        ok: false,
        rejection: "NOT_ON_ALLOWLIST",
        error:
          required.length > 0
            ? `this human is not enrolled to ${required.join(" or ")}`
            : "this human is not on any operator allowlist",
        nullifier,
        enrolledFor,
      },
      { status: 403 }
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("human_approvals")
    .select("nullifier,operator")
    .eq("gate_id", gate.id);

  if (existingError) {
    return NextResponse.json(
      { ok: false, error: existingError.message, nullifier },
      { status: 500 }
    );
  }

  const priorRows = (existing ?? []) as ApprovalRecord[];
  const priorNullifiers = distinctNullifiers(priorRows.map((r) => r.nullifier));

  if (priorNullifiers.includes(nullifier)) {
    return NextResponse.json(
      {
        ok: false,
        rejection: "DUPLICATE_NULLIFIER",
        error: "this human has already authorized this decision",
        nullifier,
        enrolledFor,
      },
      { status: 409 }
    );
  }

  const takenOperators = new Set(priorRows.map((r) => r.operator));
  const operator =
    eligible.find((op) => !takenOperators.has(op)) ??
    eligible[0] ??
    enrolledFor[0] ??
    "unenrolled";

  const ts = Date.now();
  const { error: insertError } = await supabase.from("human_approvals").insert({
    gate_id: gate.id,
    nullifier,
    operator,
    chosen_action: body.chosenAction ?? null,
    ts,
  });

  if (insertError) {
    const duplicate = insertError.code === "23505";
    return NextResponse.json(
      {
        ok: false,
        rejection: duplicate ? "DUPLICATE_NULLIFIER" : undefined,
        error: duplicate
          ? "this human has already authorized this decision"
          : insertError.message,
        nullifier,
        enrolledFor,
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  const collected = distinctNullifiers([...priorNullifiers, nullifier]);
  const operatorsCovered = new Set([...takenOperators, operator]);
  const quorumMet = collected.length >= gate.required_quorum;
  const operatorsMet = required.every((op) => operatorsCovered.has(op));
  const satisfied = quorumMet && operatorsMet;

  await supabase.from("events").insert({
    ts,
    type: "approval",
    node_id: null,
    message: `${operator} authorized gate ${gate.id} — ${collected.length} of ${gate.required_quorum} distinct human${gate.required_quorum === 1 ? "" : "s"}`,
  });

  if (satisfied) {
    await supabase
      .from("human_gates")
      .update({ status: "authorized", chosen_action: body.chosenAction ?? null })
      .eq("id", gate.id);

    await supabase.from("events").insert({
      ts: ts + 1,
      type: "override",
      node_id: null,
      message: `gate ${gate.id} satisfied — ${collected.length} distinct humans across ${[...operatorsCovered].join(" + ")}`,
    });
  }

  return NextResponse.json({
    ok: true,
    recorded: true,
    nullifier,
    operator,
    enrolledFor,
    selfEnrolled: eligible.length === 0,
    collected: collected.length,
    requiredQuorum: gate.required_quorum,
    operatorsRequired: required,
    operatorsCovered: [...operatorsCovered],
    satisfied,
  });
}
