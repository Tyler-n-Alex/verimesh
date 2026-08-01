import { NextResponse } from "next/server";
import { SCENARIOS, scenarioById } from "@verimesh/verifier/scenarios";
import { anomalyNodeOf, injectScenario } from "@verimesh/verifier/inject";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DEMO_OFF, demoModeOn } from "@/lib/demo";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 20_000;

interface Body {
  scenarioId?: string;
}

export async function GET() {
  return NextResponse.json({
    demoMode: demoModeOn(),
    scenarios: SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      signature: scenario.signature,
      narrative: scenario.narrative,
      node: anomalyNodeOf(scenario) ?? null,
      expect: {
        verdict: scenario.expect.verdict,
        tier: scenario.expect.tier,
        quorum: scenario.expect.quorum,
        operators: scenario.expect.operators,
      },
    })),
  });
}

export async function POST(request: Request) {
  if (!demoModeOn()) {
    return NextResponse.json({ error: DEMO_OFF }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: ADMIN_MISSING }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const scenario = scenarioById(body.scenarioId ?? "");
  if (!scenario) {
    return NextResponse.json(
      {
        error: `unknown scenario — have ${SCENARIOS.map((s) => s.id).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const { data: recent } = await supabase
    .from("events")
    .select("ts")
    .eq("type", "scenario")
    .order("ts", { ascending: false })
    .limit(1);

  const lastAt = Number((recent ?? [])[0]?.ts ?? 0);
  const since = Date.now() - lastAt;
  if (lastAt > 0 && since < COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: `a scenario was injected ${Math.round(since / 1000)}s ago — give the agent ${Math.ceil((COOLDOWN_MS - since) / 1000)}s to react before injecting another`,
        cooldownMs: COOLDOWN_MS - since,
      },
      { status: 429 }
    );
  }

  const anomalyNode = anomalyNodeOf(scenario) ?? null;

  if (anomalyNode) {
    const { data: node } = await supabase
      .from("nodes")
      .select("status")
      .eq("id", anomalyNode)
      .maybeSingle<{ status: string }>();

    if (node?.status === "awaiting_human") {
      return NextResponse.json(
        {
          error: `${anomalyNode} is already frozen awaiting a human — the detector skips it, so a fresh injection would do nothing. Resolve the open gate or reset the mesh first.`,
          blockedBy: "awaiting_human",
          node: anomalyNode,
        },
        { status: 409 }
      );
    }
  }

  const { injection } = await injectScenario(supabase, scenario);

  return NextResponse.json({
    ok: true,
    scenarioId: scenario.id,
    title: scenario.title,
    narrative: scenario.narrative,
    node: anomalyNode,
    injection: injection ?? null,
    expect: scenario.expect,
    note: injection
      ? `${injection.nodeId} driven to ${injection.power}W — starts at ${injection.temp.toFixed(1)}°C and settles at ${injection.equilibrium.toFixed(1)}°C, over its ceiling`
      : "faults written, but no thermal drive applied — the fault may decay before the agent sees it",
  });
}
