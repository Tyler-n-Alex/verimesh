// Diagnostic: what can this handset actually read without root?
// Android restricts procfs for unprivileged apps, and which paths are blocked
// varies by vendor and OS version. Run this once on a new device to find out
// which sensors report.js can rely on. Reads only; changes nothing.
//
//   node probe.js

const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

function line(label, value) {
  console.log(`${label.padEnd(28)} ${value}`);
}

function readable(path) {
  try {
    const text = fs.readFileSync(path, "utf8");
    return { ok: true, text };
  } catch (err) {
    return { ok: false, code: err.code || err.message };
  }
}

function probeFile(label, path, render) {
  const r = readable(path);
  if (!r.ok) return line(label, `BLOCKED (${r.code})`);
  line(label, `ok — ${render ? render(r.text) : r.text.split("\n")[0].trim()}`);
}

console.log("=== runtime ===");
line("node", process.version);
line("global fetch", typeof fetch === "function" ? "yes" : "NO");
line("cores (availableParallelism)", os.availableParallelism ? os.availableParallelism() : "n/a");
line("worker_threads", (() => {
  try {
    require("node:worker_threads");
    return "yes";
  } catch {
    return "NO";
  }
})());

console.log("\n=== cpu load candidates ===");
probeFile("/proc/stat", "/proc/stat");
probeFile("/proc/loadavg", "/proc/loadavg");
probeFile("/proc/uptime", "/proc/uptime");
probeFile("/proc/self/stat", "/proc/self/stat", (t) => `${t.slice(0, 60)}...`);
probeFile("/proc/self/schedstat", "/proc/self/schedstat");
// System-wide CPU pressure. Strictly better than our own contention proxy if
// the kernel exposes it and Android lets us read it.
probeFile("/proc/pressure/cpu", "/proc/pressure/cpu");

const times = os.cpus().map((c) => c.times);
const totals = times.reduce((a, t) => a + t.user + t.nice + t.sys + t.idle + t.irq, 0);
line("os.cpus() times", totals > 0 ? `ok — ${times.length} cpus, nonzero` : `USELESS (all zero, ${times.length} cpus)`);

try {
  line("os.loadavg()", os.loadavg().join(", "));
} catch (err) {
  line("os.loadavg()", `threw ${err.message}`);
}

console.log("\n=== does /proc/stat actually advance? ===");
const a = readable("/proc/stat");
if (!a.ok) {
  line("delta check", `skipped — ${a.code}`);
} else {
  const first = a.text.split("\n")[0];
  const spin = Date.now();
  while (Date.now() - spin < 400) {
    /* burn a little cpu so the counters must move */
  }
  const second = readable("/proc/stat").text.split("\n")[0];
  line("delta check", first === second ? "STATIC — unusable for load" : "advancing — usable");
}

console.log("\n=== memory ===");
probeFile("/proc/meminfo", "/proc/meminfo");
line("os.totalmem/freemem", `${(os.totalmem() / 1e9).toFixed(2)}GB total, ${(os.freemem() / 1e9).toFixed(2)}GB free`);

console.log("\n=== temperature ===");
let zones = [];
try {
  zones = fs.readdirSync("/sys/class/thermal").filter((d) => d.startsWith("thermal_zone"));
  line("/sys/class/thermal", `${zones.length} zones listed`);
} catch (err) {
  line("/sys/class/thermal", `BLOCKED (${err.code})`);
}

let shown = 0;
for (const dir of zones) {
  const type = readable(`/sys/class/thermal/${dir}/type`);
  const temp = readable(`/sys/class/thermal/${dir}/temp`);
  if (!type.ok || !temp.ok) continue;
  const celsius = Number(temp.text.trim()) / 1000;
  if (!Number.isFinite(celsius)) continue;
  const name = type.text.trim();
  const matches = /cpu|soc|ap|tsens|big|little/.test(name.toLowerCase());
  if (shown < 12 || matches) {
    line(`  ${dir}`, `${name} = ${celsius.toFixed(1)}C${matches ? "  <- report.js would pick this" : ""}`);
    shown++;
  }
}
if (zones.length && shown === 0) line("  readable zones", "NONE — every zone blocked");

console.log("\n=== battery (needs Termux:API) ===");
try {
  const raw = execFileSync("termux-battery-status", { timeout: 5000 }).toString();
  const parsed = JSON.parse(raw);
  line("termux-battery-status", `ok — ${parsed.percentage}%, ${parsed.temperature}C, ${parsed.plugged}`);
} catch (err) {
  line("termux-battery-status", `unavailable (${err.code || err.message})`);
}
probeFile("power_supply/current_now", "/sys/class/power_supply/battery/current_now");
probeFile("power_supply/voltage_now", "/sys/class/power_supply/battery/voltage_now");

// ---------------------------------------------------------------------------
// Probe-window sweep.
//
// Scheduler run delay depends heavily on how long we stay continuously
// runnable. A thread that just woke from a 2s sleep has low vruntime and
// preempts CPU hogs immediately, so a short window shows almost no contention
// even on a fully saturated phone. Long enough, and we exhaust that advantage
// and start getting round-robined like everything else.
//
// So the window length is the whole ballgame. Sweep it and read off the
// shortest one that actually separates idle from saturated.
// ---------------------------------------------------------------------------

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

function sampleWindow(budgetMs) {
  const before = readSchedstat();
  const started = Date.now();
  let iterations = 0;
  let sink = 0;
  while (Date.now() - started < budgetMs) {
    for (let i = 0; i < 2000; i++) sink += Math.sqrt(i + (sink % 7));
    iterations += 2000;
  }
  const wall = Math.max(1, Date.now() - started);
  const after = readSchedstat();
  if (!before || !after) return null;
  const dCpu = after.cpu - before.cpu;
  const dDelay = after.delay - before.delay;
  const contention = dCpu + dDelay > 0 ? dDelay / (dCpu + dDelay) : 0;
  return {
    budgetMs,
    wall,
    contention,
    coreShare: dCpu / 1e6 / wall,
    rate: iterations / wall,
    sink,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

void (async () => {
  console.log("\n=== probe-window sweep ===");
  console.log(
    "window   contention   core share   rate     (contention = waiting / (waiting + running))"
  );
  for (const ms of [10, 20, 50, 100, 200, 400, 800]) {
    // Sleep between samples so each one starts from the same just-woken state
    // the real reporter ticks from. Back-to-back samples would inherit the
    // previous one's vruntime and overstate contention at short windows.
    await sleep(600);
    const s = sampleWindow(ms);
    if (!s) {
      console.log(`${String(ms).padStart(5)}ms   schedstat unreadable`);
      continue;
    }
    console.log(
      `${String(ms).padStart(5)}ms   ${(s.contention * 100).toFixed(1).padStart(9)}%   ` +
        `${(s.coreShare * 100).toFixed(1).padStart(9)}%   ${String(Math.round(s.rate)).padStart(6)}`
    );
  }
  console.log(
    "\nRun once idle, then again during `node heat.js 45 16`. The right probe window is"
  );
  console.log(
    "the shortest one whose contention clearly separates the two runs."
  );
})();
