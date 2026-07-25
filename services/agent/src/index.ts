import { runSimulator, parseFaultEnv, DEFAULT_INTERVAL_MS } from "@verimesh/sim";
import { startAgent } from "./loop";

const mode = process.env.AGENT_MODE ?? "full";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  }

  const stops: (() => void)[] = [];

  if (mode === "sim" || mode === "full") {
    const stopSim = await runSimulator({
      supabaseUrl: url,
      serviceKey: key,
      intervalMs: Number(process.env.SIM_INTERVAL_MS ?? DEFAULT_INTERVAL_MS),
      faults: parseFaultEnv(process.env.SIM_FAULTS),
    });
    stops.push(stopSim);
    console.log("[agent] simulator running");
  }

  if (mode === "agent" || mode === "full") {
    const stopAgent = await startAgent();
    stops.push(stopAgent);
  }

  const shutdown = () => {
    for (const stop of stops) stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
