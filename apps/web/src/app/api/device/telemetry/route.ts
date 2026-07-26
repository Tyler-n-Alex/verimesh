import { NextResponse } from "next/server";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEVICE_BOUNDS,
  DEVICE_NODE_ID,
  authorizeDevice,
  classifyDevice,
  deviceOwnsStatus,
  deviceTempGates,
} from "@/lib/device";

export const dynamic = "force-dynamic";

interface TelemetryBody {
  nodeId?: string;
  load?: number | null;
  temp?: number | null;
  throughput?: number | null;
  power?: number | null;
  mem?: number | null;
  socTemp?: number | null;
  battery?: number | null;
  charging?: boolean | null;
  label?: string | null;
  tempSource?: string | null;
  loadSource?: string | null;
}

const LOAD_SOURCES = new Set(["procstat", "pressure", "contention", "none"]);

interface NodeRow {
  id: string;
  status: string;
  kind: string;
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const SHED_ACTIONS = new Set(["THROTTLE_NODE", "ISOLATE_NODE"]);
const DIRECTIVE_TTL_MS = Number(process.env.DEVICE_DIRECTIVE_TTL_MS ?? 120_000);

interface Directive {
  action: string;
  proposalId: number;
  ts: number;
}

const DIRECTIVE_POLL_MS = Number(process.env.DEVICE_DIRECTIVE_POLL_MS ?? 6000);
const directiveCache = new Map<
  string,
  { at: number; value: Directive | null }
>();

async function pendingDirective(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  nodeId: string,
  now: number
): Promise<Directive | null> {
  const cached = directiveCache.get(nodeId);
  if (cached && now - cached.at < DIRECTIVE_POLL_MS) return cached.value;

  const found = await lookupDirective(supabase, nodeId, now);
  directiveCache.set(nodeId, { at: now, value: found });
  return found;
}

async function lookupDirective(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  nodeId: string,
  now: number
): Promise<Directive | null> {
  const { data: proposals } = await supabase
    .from("proposals")
    .select("id")
    .eq("node_id", nodeId)
    .gte("ts", now - DIRECTIVE_TTL_MS);

  const ids = (proposals ?? []).map((row) => row.id as number);
  if (ids.length === 0) return null;

  const { data: commits } = await supabase
    .from("commits")
    .select("proposal_id,applied_action,ts")
    .in("proposal_id", ids)
    .order("ts", { ascending: false })
    .limit(1);

  const commit = (commits ?? [])[0];
  if (!commit) return null;
  if (!SHED_ACTIONS.has(commit.applied_action as string)) return null;
  if (now - Number(commit.ts) > DIRECTIVE_TTL_MS) return null;

  return {
    action: commit.applied_action as string,
    proposalId: commit.proposal_id as number,
    ts: Number(commit.ts),
  };
}

export async function POST(request: Request) {
  const denied = authorizeDevice(request);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: ADMIN_MISSING }, { status: 500 });
  }

  let body: TelemetryBody;
  try {
    body = (await request.json()) as TelemetryBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const nodeId = body.nodeId ?? DEVICE_NODE_ID;

  const { data: node, error: nodeError } = await supabase
    .from("nodes")
    .select("id,status,kind")
    .eq("id", nodeId)
    .maybeSingle<NodeRow>();

  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 500 });
  }
  if (!node) {
    return NextResponse.json(
      {
        error: `unknown node ${nodeId} — POST /api/device/register first`,
      },
      { status: 404 }
    );
  }

  const load = finite(body.load);
  const temp = finite(body.temp);
  const throughput = finite(body.throughput);
  const power = finite(body.power);
  const mem = finite(body.mem);
  const socTemp = finite(body.socTemp);
  const battery = finite(body.battery);

  const ts = Date.now();
  const nowIso = new Date(ts).toISOString();

  const { error: telemetryError } = await supabase.from("telemetry").insert({
    node_id: nodeId,
    ts,
    load,
    temp,
    throughput,
    power,
    mem,
    fan_rpm: null,
    source: "real",
  });

  if (telemetryError) {
    return NextResponse.json({ error: telemetryError.message }, { status: 500 });
  }

  const loadSource =
    body.loadSource && LOAD_SOURCES.has(body.loadSource)
      ? body.loadSource
      : "procstat";

  const classification = classifyDevice(temp, load, DEVICE_BOUNDS, loadSource);
  const holdStatus = node.status === "isolated" || node.status === "awaiting_human";
  const nextStatus =
    deviceOwnsStatus() && !holdStatus ? classification.status : node.status;

  const update: Record<string, unknown> = {
    metrics: {
      ts,
      load: load ?? 0,
      temp: temp ?? 0,
      throughput: throughput ?? 0,
      power: power ?? 0,
      mem: mem ?? 0,
      fanRpm: 0,
      socTemp,
      battery,
      charging: body.charging ?? null,
      tempSource: body.tempSource === "soc" ? "soc" : "battery",
      // The bounds this reading was actually judged against, and whether
      // temperature was allowed to judge at all. The inspector is a client
      // component, so it cannot read DEVICE_T_MAX / DEVICE_L_MAX — those are
      // not NEXT_PUBLIC_ and Next strips them from the browser bundle, leaving
      // it drawing the hardcoded defaults while the server used something else.
      // Sending them removes any chance of the two disagreeing.
      bounds: DEVICE_BOUNDS,
      tempGates: deviceTempGates(),
      // Which mechanism produced `load`. On handsets that deny /proc/stat this
      // is "contention", which is not the same quantity as cpu utilisation —
      // the inspector needs it so its wording can name what was measured.
      loadSource,
    },
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  if (nextStatus !== node.status) update.status = nextStatus;
  if (body.label) update.device_label = body.label;

  const { error: updateError } = await supabase
    .from("nodes")
    .update(update)
    .eq("id", nodeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const transitioned = nextStatus !== node.status;

  if (transitioned) {
    const detail =
      classification.reasons.length > 0
        ? classification.reasons.join("; ")
        : "back inside its envelope";
    await supabase.from("events").insert({
      ts,
      type: nextStatus === "healthy" ? "device" : "anomaly",
      node_id: nodeId,
      message: `${node.id} ${node.status} -> ${nextStatus}: ${detail}`,
    });
  }

  const directive = await pendingDirective(supabase, nodeId, ts);

  return NextResponse.json({
    ok: true,
    nodeId,
    status: nextStatus,
    previousStatus: node.status,
    transitioned,
    statusOwnedByIngest: deviceOwnsStatus(),
    held: holdStatus,
    bounds: DEVICE_BOUNDS,
    reasons: classification.reasons,
    directive,
  });
}
