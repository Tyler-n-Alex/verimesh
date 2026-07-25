const INGEST_URL =
  process.env.VERIMESH_INGEST_URL ||
  "http://localhost:3000/api/device/telemetry";
const TOKEN = process.env.VERIMESH_DEVICE_TOKEN;
const NODE_ID = process.env.VERIMESH_NODE_ID || "device-s22";
const INTERVAL_MS = Number(process.env.VERIMESH_INTERVAL_MS || 2000);
const PROFILE = process.argv[2] || "idle";
const TICKS = Number(process.argv[3] || 0);

if (!TOKEN) {
  console.error("set VERIMESH_DEVICE_TOKEN to match DEVICE_TOKEN in .env.local");
  process.exit(1);
}

const PROFILES = {
  idle: { load: 0.12, temp: 29.5, work: 1000 },
  busy: { load: 0.62, temp: 35.0, work: 880 },
  hot: { load: 0.97, temp: 42.4, work: 610 },
  warm: { load: 0.66, temp: 38.2, work: 760 },
};

const profile = PROFILES[PROFILE];
if (!profile) {
  console.error(`unknown profile ${PROFILE}; use ${Object.keys(PROFILES).join(" | ")}`);
  process.exit(1);
}

let tick = 0;

async function send() {
  tick++;
  const jitter = (n, spread) => Number((n + (Math.random() - 0.5) * spread).toFixed(2));

  const payload = {
    nodeId: NODE_ID,
    label: "Galaxy S22 (simulated handset)",
    load: Math.min(1, Math.max(0, jitter(profile.load, 0.05))),
    temp: jitter(profile.temp, 0.4),
    socTemp: jitter(profile.temp + 8, 0.6),
    throughput: Math.round(jitter(profile.work, 30)),
    power: jitter(6.4, 1.2),
    mem: jitter(0.58, 0.04),
    battery: 84,
    charging: true,
  };

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`${res.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  const parsed = JSON.parse(text);
  console.log(
    `#${tick} ${PROFILE} load ${(payload.load * 100).toFixed(0)}% batt ${payload.temp}C -> ${parsed.status}${parsed.transitioned ? " (transition)" : ""}`
  );

  if (TICKS > 0 && tick >= TICKS) process.exit(0);
}

console.log(`fake phone: ${PROFILE} -> ${INGEST_URL}`);
void send();
if (TICKS !== 1) setInterval(() => void send(), INTERVAL_MS);
