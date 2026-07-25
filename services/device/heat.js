const os = require("node:os");
const {
  Worker,
  isMainThread,
  workerData,
} = require("node:worker_threads");

if (!isMainThread) {
  const until = workerData.until;
  let sink = 0;
  while (Date.now() < until) {
    for (let i = 0; i < 500000; i++) {
      sink += Math.sqrt(i * 1.0001 + (sink % 7));
    }
  }
  if (sink === Number.POSITIVE_INFINITY) console.error("overflow");
} else {
  const seconds = Number(process.argv[2] || 45);
  const cores = os.cpus().length || 8;
  const workers = Number(process.argv[3] || cores);

  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) {
    console.error("usage: node heat.js [seconds 1-300] [workers]");
    process.exit(1);
  }

  const until = Date.now() + seconds * 1000;
  console.log(
    `verimesh: heating ${workers} of ${cores} cores for ${seconds}s (node worker_threads)`
  );

  let alive = workers;
  const pool = [];

  for (let i = 0; i < workers; i++) {
    const worker = new Worker(__filename, { workerData: { until } });
    worker.on("error", (err) => console.error(`worker error: ${err.message}`));
    worker.on("exit", () => {
      alive--;
      if (alive === 0) console.log("verimesh: burst finished");
    });
    pool.push(worker);
  }

  const stop = () => {
    console.log("\nverimesh: stopping early");
    for (const worker of pool) void worker.terminate();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const ticker = setInterval(() => {
    const left = Math.max(0, Math.round((until - Date.now()) / 1000));
    process.stdout.write(`\rverimesh: ${left}s remaining   `);
    if (left === 0) {
      clearInterval(ticker);
      process.stdout.write("\n");
    }
  }, 1000);
  ticker.unref?.();
}
