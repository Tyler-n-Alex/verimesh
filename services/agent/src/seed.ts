import { createClient } from "@supabase/supabase-js";
import { blueprint } from "@verimesh/shared";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const baseMetrics = {
  load: 0.42,
  temp: 46,
  throughput: 1000,
  power: 210,
  mem: 0.38,
  fanRpm: 2100,
};

async function seed() {
  const ts = Date.now();

  const nodes = blueprint.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    operator_id: n.operator,
    x: n.pos[0],
    y: n.pos[1],
    z: n.pos[2],
    status: "healthy",
    metrics: { ts, ...baseMetrics },
  }));

  const { error: nodesError } = await supabase
    .from("nodes")
    .upsert(nodes, { onConflict: "id" });

  if (nodesError) throw nodesError;

  const { error: deleteEdgesError } = await supabase
    .from("edges")
    .delete()
    .gte("id", 0);

  if (deleteEdgesError) throw deleteEdgesError;

  const edges = blueprint.edges.map((e) => ({
    from_node: e.from,
    to_node: e.to,
    weight: e.weight,
  }));

  const { error: edgesError } = await supabase.from("edges").insert(edges);

  if (edgesError) throw edgesError;

  const telemetry = blueprint.nodes.map((n) => ({
    node_id: n.id,
    ts,
    load: baseMetrics.load,
    temp: baseMetrics.temp,
    throughput: baseMetrics.throughput,
    power: baseMetrics.power,
    mem: baseMetrics.mem,
    fan_rpm: baseMetrics.fanRpm,
  }));

  const { error: telemetryError } = await supabase
    .from("telemetry")
    .insert(telemetry);

  if (telemetryError) throw telemetryError;

  const { error: eventError } = await supabase.from("events").insert({
    ts,
    type: "seed",
    node_id: null,
    message: `seeded ${nodes.length} nodes, ${edges.length} edges`,
  });

  if (eventError) throw eventError;

  console.log(`seeded ${nodes.length} nodes, ${edges.length} edges`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
