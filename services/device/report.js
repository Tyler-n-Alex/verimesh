const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const INGEST_URL = process.env.VERIMESH_INGEST_URL;
const TOKEN = process.env.VERIMESH_DEVICE_TOKEN;
const NODE_ID = process.env.VERIMESH_NODE_ID || "device-s22";
const LABEL = process.env.VERIMESH_DEVICE_LABEL || "Galaxy S22";
const INTERVAL_MS = Number(process.env.VERIMESH_INTERVAL_MS || 2000);
const X_NOMINAL = Number(process.env.VERIMESH_X_NOMINAL || 1000);

if (!INGEST_URL || !TOKEN) {
  console.error(
    "set VERIMESH_INGEST_URL and VERIMESH_DEVICE_TOKEN, then rerun. See TASKS/DEVICE-NODE.md"
  );
  process.exit(1);
}

let prevCpu = null;

function cpuLoad() {
  try {
    const line = fs
      .readFileSync("/proc/stat", "utf8")
      .split("\n")[0]
      .trim()
      .split(/\s+/)
      .slice(1)
      .map(Number);
    const idle = line[3] + (line[4] || 0);
    const total = line.reduce((a, b) => a + b, 0);
    if (!prevCpu) {
      prevCpu = { idle, total };
      return null;
    }
    const dIdle = idle - prevCpu.idle;
    const dTotal = total - prevCpu.total;
    prevCpu = { idle, total };
    if (dTotal <= 0) return null;
    return Math.min(1, Math.max(0, 1 - dIdle / dTotal));
  } catch {
    return null;
  }
}

function batteryStatus() {
  try {
    const raw = execFileSync("termux-battery-status", { timeout: 4000 });
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function readNumber(path, scale) {
  try {
    const raw = Number(fs.readFileSync(path, "utf8").trim());
    if (!Number.isFinite(raw)) return null;
    return raw / scale;
  } catch {
    return null;
  }
}

let socZone = undefined;

function socTemp() {
  if (socZone === undefined) {
    socZone = null;
    try {
      for (const dir of fs.readdirSync("/sys/class/thermal")) {
        if (!dir.startsWith("thermal_zone")) continue;
        let type = "";
        try {
          type = fs
            .readFileSync(`/sys/class/thermal/${dir}/type`, "utf8")
            .trim()
            .toLowerCase();
        } catch {
          continue;
        }
        if (/cpu|soc|ap|tsens|big|little/.test(type)) {
          const probe = readNumber(`/sys/class/thermal/${dir}/temp`, 1000);
          if (probe !== null && probe > 5 && probe < 150) {
            socZone = `/sys/class/thermal/${dir}/temp`;
            break;
          }
        }
      }
    } catch {
      socZone = null;
    }
  }
  return socZone ? readNumber(socZone, 1000) : null;
}

function memoryUsed() {
  try {
    const text = fs.readFileSync("/proc/meminfo", "utf8");
    const total = Number(/MemTotal:\s+(\d+)/.exec(text)?.[1]);
    const available = Number(/MemAvailable:\s+(\d+)/.exec(text)?.[1]);
    if (!Number.isFinite(total) || !Number.isFinite(available) || total <= 0) {
      return null;
    }
    return Math.min(1, Math.max(0, 1 - available / total));
  } catch {
    return null;
  }
}

function workRate() {
  const budgetMs = 12;
  const started = Date.now();
  let iterations = 0;
  let sink = 0;
  while (Date.now() - started < budgetMs) {
    for (let i = 0; i < 2000; i++) sink += Math.sqrt(i + sink % 7);
    iterations += 2000;
  }
  const elapsed = Math.max(1, Date.now() - started);
  if (sink === Number.POSITIVE_INFINITY) return null;
  return iterations / elapsed;
}

let baselineRate = null;

function throughput() {
  const rate = workRate();
  if (rate === null) return null;
  if (baselineRate === null || rate > baselineRate) baselineRate = rate;
  if (!baselineRate) return null;
  return Math.round((rate / baselineRate) * X_NOMINAL);
}

function power(battery) {
  const currentUa = readNumber(
    "/sys/class/power_supply/battery/current_now",
    1
  );
  const voltageUv = readNumber(
    "/sys/class/power_supply/battery/voltage_now",
    1
  );
  if (currentUa === null || voltageUv === null) return null;
  const watts = (Math.abs(currentUa) / 1e6) * (voltageUv / 1e6);
  if (!Number.isFinite(watts) || watts > 100) return null;
  return Number(watts.toFixed(2));
}

let sent = 0;
let failures = 0;

async function tick() {
  const load = cpuLoad();
  if (load === null) return;

  const battery = batteryStatus();
  const payload = {
    nodeId: NODE_ID,
    label: LABEL,
    load,
    temp: battery && Number.isFinite(battery.temperature) ? battery.temperature : null,
    socTemp: socTemp(),
    throughput: throughput(),
    power: power(battery),
    mem: memoryUsed(),
    battery: battery && Number.isFinite(battery.percentage) ? battery.percentage : null,
    charging: battery ? battery.plugged !== "UNPLUGGED" : null,
  };

  try {
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
      failures++;
      console.error(`ingest ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    sent++;
    failures = 0;
    const parsed = JSON.parse(text);
    const bits = [
      `#${sent}`,
      `load ${(load * 100).toFixed(0)}%`,
      payload.temp !== null ? `batt ${payload.temp.toFixed(1)}C` : "batt -",
      payload.socTemp !== null ? `soc ${payload.socTemp.toFixed(1)}C` : "soc -",
      payload.throughput !== null ? `work ${payload.throughput}` : "work -",
      `-> ${parsed.status}`,
    ];
    console.log(bits.join("  "));
  } catch (err) {
    failures++;
    console.error(`ingest failed (${failures}): ${err.message}`);
  }
}

console.log(`verimesh device reporter -> ${INGEST_URL}`);
console.log(`node ${NODE_ID} (${LABEL}) every ${INTERVAL_MS}ms`);

void tick();
setInterval(() => void tick(), INTERVAL_MS);
