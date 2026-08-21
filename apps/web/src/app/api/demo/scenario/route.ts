import { NextResponse } from "next/server";
import { SCENARIOS, scenarioById } from "@verimesh/verifier/scenarios";
import {
  anomalyNodeOf,
  describeInjection,
  injectScenario,
  resolveScenario,
} from "@verimesh/verifier/inject";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DEMO_OFF, demoModeOn } from "@/lib/demo";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 20_000;
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? "";

interface Body {
  scenarioId?: string;
}

const INCIDENTS_QUERY = `query IncidentCounts($nodeIds: [String!]!) {
  nodeHistories(where: { nodeId_in: $nodeIds }, first: 1000) {
    nodeId
    incidentCount
  }
}`;

async function incidentCounts(
  nodeIds: string[]
): Promise<Record<string, number> | null> {
  if (!SUBGRAPH_URL || nodeIds.length === 0) return null;

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: INCIDENTS_QUERY,
        variables: { nodeIds },
      }),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as {
      data?: { nodeHistories?: { nodeId: string; incidentCount: number }[] };
      errors?: unknown[];
    };

    if (body.errors?.length || !body.data) return null;

    const counts: Record<string, number> = {};
    for (const nodeId of nodeIds) counts[nodeId] = 0;
    for (const row of body.data.nodeHistories ?? []) {
      counts[row.nodeId] = row.incidentCount;
    }
    return counts;
  } catch {
    return null;
  }
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
      history: scenario.history,
      relocatable: scenario.relocatable,
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

  const declared = scenarioById(body.scenarioId ?? "");
  if (!declared) {
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

  const { data: rows } = await supabase
    .from("nodes")
    .select("id")
    .neq("kind", "device")
    .order("id");

  const candidates = ((rows ?? []) as { id: string }[]).map((row) => row.id);

  const counts =
    declared.history === "any" ? null : await incidentCounts(candidates);

  const resolved = resolveScenario(declared, candidates, counts);
  const scenario = resolved.scenario;
  const report = await injectScenario(supabase, scenario);

  return NextResponse.json({
    ok: true,
    scenarioId: scenario.id,
    title: scenario.title,
    narrative: scenario.narrative,
    node: report.anomalyNode,
    relocatedFrom: resolved.relocatedFrom ?? null,
    history: resolved.history,
    injection: report.injection ?? null,
    cleared: {
      gates: report.gatesCancelled,
      held: report.heldReleased,
      reset: report.nodesReset,
    },
    expect: scenario.expect,
    note: describeInjection(report.state, report.anomalyNode),
  });
}
