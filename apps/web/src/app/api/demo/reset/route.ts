import { NextResponse } from "next/server";
import { BASELINE_METRICS } from "@verimesh/verifier/scenarios";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DEMO_OFF, demoModeOn } from "@/lib/demo";

export const dynamic = "force-dynamic";

const HELD_STATUSES = ["awaiting_human", "isolated", "violation", "warning", "offline"];

export async function POST() {
  if (!demoModeOn()) {
    return NextResponse.json({ error: DEMO_OFF }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: ADMIN_MISSING }, { status: 500 });
  }

  const { data: gates } = await supabase
    .from("human_gates")
    .update({ status: "cancelled" })
    .in("status", ["pending", "authorized", "committing"])
    .select("id");

  const { data: held } = await supabase
    .from("nodes")
    .select("id")
    .neq("kind", "device")
    .in("status", HELD_STATUSES);

  const ts = Date.now();
  const heldIds = (held ?? []).map((n) => n.id as string);

  if (heldIds.length > 0) {
    await supabase
      .from("nodes")
      .update({
        status: "healthy",
        metrics: { ...BASELINE_METRICS, ts },
        updated_at: new Date(ts).toISOString(),
      })
      .in("id", heldIds);
  }

  const { data: heldDevices } = await supabase
    .from("nodes")
    .update({ status: "offline", updated_at: new Date(ts).toISOString() })
    .eq("kind", "device")
    .eq("status", "awaiting_human")
    .select("id");

  const deviceIds = (heldDevices ?? []).map((n) => n.id as string);

  await supabase.from("events").insert({
    ts,
    type: "reset",
    node_id: null,
    message: `demo reset — ${(gates ?? []).length} open gate(s) cancelled, ${heldIds.length} node(s) returned to baseline${deviceIds.length > 0 ? `, ${deviceIds.join(", ")} released to offline` : ""}`,
  });

  return NextResponse.json({
    ok: true,
    gatesCancelled: (gates ?? []).map((g) => g.id),
    nodesReset: heldIds,
    devicesReleased: deviceIds,
  });
}
