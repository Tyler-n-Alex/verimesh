import { NextResponse } from "next/server";
import { ACTIONS, type Action, type AuthTier } from "@verimesh/shared";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const HIGH_PRIVILEGE: Action[] = ["ISOLATE_NODE", "THROTTLE_NODE"];

interface RehearseBody {
  action?: string;
  nodeId?: string;
}

interface NodeRecord {
  id: string;
  name: string;
  operator_id: string;
}

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: ADMIN_MISSING }, { status: 500 });
  }

  let body: RehearseBody;
  try {
    body = (await request.json()) as RehearseBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { action, nodeId } = body;
  if (!action || !isAction(action)) {
    return NextResponse.json(
      { error: `action must be one of ${ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!nodeId) {
    return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
  }

  const { data: node, error: nodeError } = await supabase
    .from("nodes")
    .select("id,name,operator_id")
    .eq("id", nodeId)
    .maybeSingle<NodeRecord>();

  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 500 });
  }
  if (!node) {
    return NextResponse.json({ error: `unknown node ${nodeId}` }, { status: 404 });
  }

  const { data: edges, error: edgeError } = await supabase
    .from("edges")
    .select("from_node,to_node")
    .or(`from_node.eq.${nodeId},to_node.eq.${nodeId}`);

  if (edgeError) {
    return NextResponse.json({ error: edgeError.message }, { status: 500 });
  }

  const neighbourIds = (edges ?? [])
    .map((e) => (e.from_node === nodeId ? e.to_node : e.from_node))
    .filter((id): id is string => Boolean(id));

  const { data: neighbours } = await supabase
    .from("nodes")
    .select("id,name,operator_id")
    .in("id", neighbourIds.length > 0 ? neighbourIds : ["__none__"]);

  const crossing = (neighbours ?? []).filter(
    (n) => n.operator_id !== node.operator_id
  );

  const requirement = rehearsalRequirement(
    action,
    node.operator_id,
    crossing.map((n) => n.operator_id)
  );

  const ts = Date.now();
  const breach = crossing[0] ?? null;

  const { data: proposalRows, error: proposalError } = await supabase
    .from("proposals")
    .insert({
      ts,
      node_id: nodeId,
      diagnosis: `REHEARSAL — manually triggered ${action} on ${node.name} (${node.operator_id}).`,
      proposed_action: action,
      target_nodes: [nodeId],
      expected_effect:
        requirement.tier === "T0_AUTONOMOUS"
          ? `${action} stays inside ${node.operator_id}'s envelope.`
          : `${action} on ${node.name} reaches ${requirement.operatorsRequired.join(" + ")}.`,
      confidence: 0.5,
      risk_flags: ["rehearsal"],
      llm_provider: "rehearsal",
      zerog_inference_valid: false,
      auth_tier: requirement.tier,
    })
    .select("id")
    .single<{ id: number }>();

  if (proposalError) {
    return NextResponse.json({ error: proposalError.message }, { status: 500 });
  }

  const proposalId = proposalRows.id;

  await supabase.from("events").insert({
    ts,
    type: "rehearsal",
    node_id: nodeId,
    message: `manual ${action} on ${node.name} — ${requirement.reason}`,
  });

  let gateId: number | null = null;

  if (requirement.tier === "T0_AUTONOMOUS") {
    await supabase.from("verdicts").insert({
      proposal_id: proposalId,
      verdict: "VERIFIED",
      detail: `REHEARSAL — ${action} projected in-envelope for ${node.operator_id}.`,
      violated: null,
      projected: {},
      ts: ts + 120,
    });
  } else {
    await supabase.from("verdicts").insert({
      proposal_id: proposalId,
      verdict: "VIOLATION_TRIGGERED",
      detail: `REHEARSAL — ${requirement.reason}`,
      violated: breach
        ? {
            node: breach.id,
            metric: "throughput",
            value: 612,
            bound: 800,
          }
        : null,
      projected: {},
      ts: ts + 120,
    });

    const { data: gateRows, error: gateError } = await supabase
      .from("human_gates")
      .insert({
        proposal_id: proposalId,
        status: "pending",
        ts: ts + 240,
        required_tier: requirement.tier,
        required_quorum: requirement.quorum,
        operators_required: requirement.operatorsRequired,
        reason: requirement.reason,
      })
      .select("id")
      .single<{ id: number }>();

    if (gateError) {
      return NextResponse.json({ error: gateError.message }, { status: 500 });
    }
    gateId = gateRows.id;

    await supabase
      .from("nodes")
      .update({ status: "awaiting_human", updated_at: new Date().toISOString() })
      .eq("id", nodeId);
  }

  return NextResponse.json({
    rehearsal: true,
    proposalId,
    gateId,
    requirement,
  });
}

function rehearsalRequirement(
  action: Action,
  operator: string,
  crossingOperators: string[]
): {
  tier: AuthTier;
  quorum: number;
  operatorsRequired: string[];
  reason: string;
} {
  const distinctCrossing = Array.from(new Set(crossingOperators)).filter(
    (op) => op !== operator
  );

  if (action === "ISOLATE_NODE" && distinctCrossing.length > 0) {
    const other = distinctCrossing[0];
    return {
      tier: "T2_QUORUM",
      quorum: 2,
      operatorsRequired: [operator, other],
      reason: `isolating ${operator}'s node would breach ${other}'s neighbouring node`,
    };
  }

  if (HIGH_PRIVILEGE.includes(action)) {
    return {
      tier: "T1_SINGLE",
      quorum: 1,
      operatorsRequired: [operator],
      reason: `${action} is a high-privilege action confined to ${operator}`,
    };
  }

  return {
    tier: "T0_AUTONOMOUS",
    quorum: 0,
    operatorsRequired: [],
    reason: `${action} is in-envelope and needs no human`,
  };
}
