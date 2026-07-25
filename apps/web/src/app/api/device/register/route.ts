import { NextResponse } from "next/server";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEVICE_BOUNDS,
  DEVICE_EDGES,
  DEVICE_LABEL,
  DEVICE_NODE_ID,
  DEVICE_OPERATOR,
  DEVICE_POSITION,
  authorizeDevice,
} from "@/lib/device";

export const dynamic = "force-dynamic";

interface EdgeRow {
  from_node: string;
  to_node: string;
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

  const { error: nodeError } = await supabase.from("nodes").upsert(
    {
      id: DEVICE_NODE_ID,
      name: DEVICE_LABEL,
      operator_id: DEVICE_OPERATOR,
      x: DEVICE_POSITION[0],
      y: DEVICE_POSITION[1],
      z: DEVICE_POSITION[2],
      kind: "device",
      device_label: DEVICE_LABEL,
      status: "offline",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 500 });
  }

  const { data: existing, error: readError } = await supabase
    .from("edges")
    .select("from_node,to_node")
    .or(`from_node.eq.${DEVICE_NODE_ID},to_node.eq.${DEVICE_NODE_ID}`);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const present = new Set(
    ((existing ?? []) as EdgeRow[]).map((e) =>
      [e.from_node, e.to_node].sort().join("::")
    )
  );

  const missing = DEVICE_EDGES.filter(
    (edge) => !present.has([DEVICE_NODE_ID, edge.to].sort().join("::"))
  );

  if (missing.length > 0) {
    const { error: edgeError } = await supabase.from("edges").insert(
      missing.map((edge) => ({
        from_node: DEVICE_NODE_ID,
        to_node: edge.to,
        weight: edge.weight,
      }))
    );
    if (edgeError) {
      return NextResponse.json({ error: edgeError.message }, { status: 500 });
    }
  }

  const { data: neighbours } = await supabase
    .from("nodes")
    .select("id,operator_id")
    .in(
      "id",
      DEVICE_EDGES.map((e) => e.to)
    );

  const crossOperator = (neighbours ?? [])
    .filter((n) => n.operator_id !== DEVICE_OPERATOR)
    .map((n) => ({ node: n.id, operator: n.operator_id }));

  await supabase.from("events").insert({
    ts: Date.now(),
    type: "device",
    node_id: DEVICE_NODE_ID,
    message: `${DEVICE_LABEL} registered as ${DEVICE_OPERATOR}/${DEVICE_NODE_ID} with ${DEVICE_EDGES.length} links`,
  });

  return NextResponse.json({
    ok: true,
    nodeId: DEVICE_NODE_ID,
    operator: DEVICE_OPERATOR,
    label: DEVICE_LABEL,
    bounds: DEVICE_BOUNDS,
    edgesAdded: missing.length,
    edgesTotal: DEVICE_EDGES.length,
    crossOperator,
  });
}
