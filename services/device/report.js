const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");

const execFileAsync = promisify(execFile);

const INGEST_URL = process.env.VERIMESH_INGEST_URL;
const TOKEN = process.env.VERIMESH_DEVICE_TOKEN;
const NODE_ID = process.env.VERIMESH_NODE_ID || "device-s22";
const LABEL = process.env.VERIMESH_DEVICE_LABEL || "Galaxy S22";
const INTERVAL_MS = Number(process.env.VERIMESH_INTERVAL_MS || 2000);
const X_NOMINAL = Number(process.env.VERIMESH_X_NOMINAL || 1000);
const TEMP_SOURCE = (process.env.VERIMESH_TEMP_SOURCE || "battery").toLowerCase();
const LOAD_SOURCE = (process.env.VERIMESH_LOAD_SOURCE || "auto").toLowerCase();
// 200ms, not something smaller. Below ~100ms a freshly-woken thread keeps its
// scheduling advantage and is handed a CPU on demand even on a fully saturated
// phone, so contention reads ~0% whether the machine is idle or on fire.
// Measured on an S22 Ultra: 20ms window gave 1.9% idle vs 0.4% loaded (noise),
// 200ms gave 0.1% idle vs 52.3% loaded.
const PROBE_MS = Number(process.env.VERIMESH_PROBE_MS || 200);
const FETCH_TIMEOUT_MS = Number(process.env.VERIMESH_FETCH_TIMEOUT_MS || 4000);
const BATTERY_TIMEOUT_MS = Number(
  process.env.VERIMESH_BATTERY_TIMEOUT_MS || 8000
);
const BATTERY_MAX_AGE_MS = Number(
  process.env.VERIMESH_BATTERY_MAX_AGE_MS || 12000
);
// Battery temperature moves over tens of seconds, so there is nothing to gain
// from sampling it every tick — and something to lose, because spawning the
// helper is itself a source of the contention we are trying to measure.
const BATTERY_POLL_MS = Number(
  process.env.VERIMESH_BATTERY_POLL_MS || INTERVAL_MS * 2
);

if (!["battery", "soc", "max"].includes(TEMP_SOURCE)) {
  console.error("VERIMESH_TEMP_SOURCE must be battery | soc | max");
  process.exit(1);
}

if (!["auto", "procstat", "pressure", "contention"].includes(LOAD_SOURCE)) {
  console.error(
    "VERIMESH_LOAD_SOURCE must be auto | procstat | pressure | contention"
  );
  process.exit(1);
}

if (!INGEST_URL || !TOKEN) {
  console.error(
    "set VERIMESH_INGEST_URL and VERIMESH_DEVICE_TOKEN, then rerun. See TASKS/DEVICE-NODE.md"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CPU load
//
// Android denies unprivileged apps /proc/stat, /proc/loadavg and /proc/uptime
// (SELinux, not file permissions — root is not the issue and there is no way
// around it from Termux). On a Galaxy S22 Ultra all three read EACCES, so the
// kernel's own utilisation counters are simply unavailable.
//
// What a process may always read is its own /proc/self/schedstat, whose second
// field is run_delay: nanoseconds this thread spent runnable but waiting for a
// CPU. Sampled across a window in which we are continuously runnable, the ratio
// of waiting to running is a direct, kernel-reported measure of CPU contention.
//
// Read the naming carefully: this is contention, not utilisation. It responds
// when the CPU is oversubscribed, not merely busy — four saturated cores out of
// eight barely register, because we still get a core whenever we want one. See
// TASKS/DEVICE-NODE.md for how that changes what may be said about the number.
// ---------------------------------------------------------------------------

function canRead(path) {
  try {
    fs.readFileSync(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

let prevCpu = null;

function procStatLoad() {
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

let prevPressure = null;

function pressureLoad() {
  try {
    const text = fs.readFileSync("/proc/pressure/cpu", "utf8");
    const total = Number(/some .*total=(\d+)/.exec(text)?.[1]);
    if (!Number.isFinite(total)) return null;
    const now = Date.now();
    if (!prevPressure) {
      prevPressure = { total, now };
      return null;
    }
    const dStalledUs = total - prevPressure.total;
    const dWallUs = (now - prevPressure.now) * 1000;
    prevPressure = { total, now };
    if (dWallUs <= 0) return null;
    return Math.min(1, Math.max(0, dStalledUs / dWallUs));
  } catch {
    return null;
  }
}

function readSchedstat() {
  try {
    const parts = fs
      .readFileSync("/proc/self/schedstat", "utf8")
      .trim()
      .split(/\s+/)
      .map(Number);
    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return { cpu: parts[0], delay: parts[1] };
  } catch {
    return null;
  }
}

// One busy window serves two purposes: it is the work-rate sample, and it is
// the interval over which we are guaranteed runnable, so scheduler delay
// accumulated across it is attributable to contention rather than to our own
// idling between ticks.
function runProbe() {
  const before = readSchedstat();
  const started = Date.now();
  let iterations = 0;
  let sink = 0;
  while (Date.now() - started < PROBE_MS) {
    for (let i = 0; i < 2000; i++) sink += Math.sqrt(i + (sink % 7));
    iterations += 2000;
  }
  const elapsed = Math.max(1, Date.now() - started);
  const after = readSchedstat();

  let contention = null;
  if (before && after) {
    const dCpu = after.cpu - before.cpu;
    const dDelay = after.delay - before.delay;
    if (dCpu >= 0 && dDelay >= 0 && dCpu + dDelay > 0) {
      contention = dDelay / (dCpu + dDelay);
    }
  }

  const rate = sink === Number.POSITIVE_INFINITY ? null : iterations / elapsed;
  return { rate, contention };
}

const contentionWindow = [];

function smoothContention(sample) {
  if (sample === null) return null;
  contentionWindow.push(sample);
  if (contentionWindow.length > 3) contentionWindow.shift();
  const sorted = [...contentionWindow].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function detectLoadSource() {
  if (LOAD_SOURCE !== "auto") return LOAD_SOURCE;
  if (canRead("/proc/stat")) return "procstat";
  if (canRead("/proc/pressure/cpu")) return "pressure";
  if (readSchedstat()) return "contention";
  return "none";
}

const loadSource = detectLoadSource();

// Deliberately async. execFileSync blocks the event loop for as long as the
// helper takes, and spawning a process that talks to the Termux:API app while
// all cores are saturated can take seconds. That stalls any ingest already in
// flight, so the handset drops out precisely when it is going into violation —
// the one moment the demo cannot afford to lose it.
async function batteryStatus() {
  try {
    const { stdout } = await execFileAsync("termux-battery-status", {
      timeout: BATTERY_TIMEOUT_MS,
    });
    return JSON.parse(stdout.toString());
  } catch {
    return null;
  }
}

// Polled on its own cadence rather than inside the tick. Under a heavy burst
// termux-battery-status can take longer than the whole tick interval or time
// out entirely — measured ETIMEDOUT at 5s with 16 workers running — and a tick
// that waited on it would stall the ingest at the exact moment the node is
// going into violation. The tick reads whatever the last good sample was and
// drops it once it is stale, so a slow sensor costs freshness, never a report.
let batteryCache = { value: null, at: 0 };
let batteryPolling = false;

async function pollBattery() {
  if (batteryPolling) return;
  batteryPolling = true;
  try {
    const value = await batteryStatus();
    if (value) batteryCache = { value, at: Date.now() };
  } finally {
    batteryPolling = false;
  }
}

function currentBattery() {
  if (!batteryCache.value) return null;
  if (Date.now() - batteryCache.at > BATTERY_MAX_AGE_MS) return null;
  return batteryCache.value;
}

function batteryAgeMs() {
  return batteryCache.at ? Date.now() - batteryCache.at : null;
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

let baselineRate = null;

function throughput(rate) {
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
let warnedNullLoad = false;

async function runTick() {
  const probe = runProbe();

  let load = null;
  if (loadSource === "procstat") load = procStatLoad();
  else if (loadSource === "pressure") load = pressureLoad();
  else if (loadSource === "contention") load = smoothContention(probe.contention);

  // Never return silently on a missing load. An earlier version did, and when
  // Android blocked /proc/stat the reporter printed its banner and then went
  // completely quiet — no ticks, no errors, nothing to debug. Temperature alone
  // is still worth ingesting, and the route classifies a null load fine.
  if (load === null && !warnedNullLoad) {
    warnedNullLoad = true;
    console.error(
      `warning: no cpu load from source "${loadSource}" — still reporting temperature. ` +
        `Run "node probe.js" to see what this handset allows.`
    );
  }

  const battery = currentBattery();
  const batteryTemp =
    battery && Number.isFinite(battery.temperature) ? battery.temperature : null;
  const soc = socTemp();

  let temp = batteryTemp;
  let usedSource = "battery";
  if (TEMP_SOURCE === "soc") {
    temp = soc;
    usedSource = "soc";
  } else if (TEMP_SOURCE === "max") {
    if (soc !== null && (batteryTemp === null || soc > batteryTemp)) {
      temp = soc;
      usedSource = "soc";
    }
  }
  if (temp === null && soc !== null) {
    temp = soc;
    usedSource = "soc";
  }

  const payload = {
    nodeId: NODE_ID,
    label: LABEL,
    load,
    temp,
    tempSource: usedSource,
    loadSource,
    socTemp: soc,
    throughput: throughput(probe.rate),
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
      // Without this a stalled request hangs on undici's 5-minute header
      // timeout while later ticks pile up behind it.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
      load !== null ? `load ${(load * 100).toFixed(0)}%` : "load -",
      batteryTemp !== null
        ? `batt ${batteryTemp.toFixed(1)}C${
            (batteryAgeMs() ?? 0) > INTERVAL_MS * 2
              ? ` (${Math.round((batteryAgeMs() ?? 0) / 1000)}s old)`
              : ""
          }`
        : "batt -",
      soc !== null ? `soc ${soc.toFixed(1)}C` : "soc -",
      `using ${usedSource}${payload.temp !== null ? ` ${payload.temp.toFixed(1)}C` : ""}`,
      payload.throughput !== null ? `work ${payload.throughput}` : "work -",
      `-> ${parsed.status}`,
    ];
    console.log(bits.join("  "));
  } catch (err) {
    failures++;
    console.error(`ingest failed (${failures}): ${err.message}`);
  }
}

// setInterval does not wait for the previous tick. Under saturation that used
// to let ticks overlap and queue up behind each other, turning one slow request
// into a burst of failures. Skip instead of stacking.
let ticking = false;
let skipped = 0;

async function tick() {
  if (ticking) {
    skipped++;
    if (skipped % 5 === 1) {
      console.error(
        `previous tick still in flight, skipped ${skipped} (handset saturated)`
      );
    }
    return;
  }
  ticking = true;
  try {
    await runTick();
  } finally {
    ticking = false;
  }
}

console.log(`verimesh device reporter -> ${INGEST_URL}`);
console.log(
  `node ${NODE_ID} (${LABEL}) every ${INTERVAL_MS}ms, temp source ${TEMP_SOURCE}, load source ${loadSource}`
);
if (loadSource === "contention") {
  console.log(
    "load is scheduler contention, not kernel cpu utilisation — calibrate DEVICE_L_MAX against what you actually see"
  );
} else if (loadSource === "none") {
  console.log("no cpu load source available on this handset; reporting temperature only");
}

// One immediate sample so the first ticks have a temperature, then offset the
// steady-state polling by half an interval. Sharing a phase with the tick meant
// the subprocess spawn landed inside the probe's busy window every time, and
// the reporter spent part of every measurement contending with itself.
void pollBattery();
setTimeout(() => {
  setInterval(() => void pollBattery(), BATTERY_POLL_MS);
}, Math.round(INTERVAL_MS / 2));

void tick();
setInterval(() => void tick(), INTERVAL_MS);
