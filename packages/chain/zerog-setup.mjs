import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

const ENV_PATH = "../../.env.local";
const LEDGER_OG = Number(process.env.ZEROG_LEDGER_OG ?? 0.02);
const TRANSFER_OG = Number(process.env.ZEROG_TRANSFER_OG ?? 0.01);

function setEnvVar(key, value) {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(raw) ? raw.replace(pattern, line) : `${raw.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, next);
}

const plain = (value) =>
  JSON.stringify(value, (k, v) => (typeof v === "bigint" ? v.toString() : v));

const rpc = process.env.ZEROG_RPC;
const key = process.env.ZEROG_PRIVATE_KEY;
if (!rpc) throw new Error("ZEROG_RPC is not set");
if (!key) throw new Error("ZEROG_PRIVATE_KEY is empty — run zerog-wallet.mjs first");

const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(key, provider);
const balance = await provider.getBalance(wallet.address);

console.log("address   ", wallet.address);
console.log("balance   ", ethers.formatEther(balance), "OG");
if (balance === 0n) {
  console.error("wallet is unfunded — fund it at https://faucet.0g.ai and re-run");
  process.exit(1);
}

const broker = await createZGComputeNetworkBroker(wallet);
console.log("broker     created");

console.log("");
console.log("--- available inference providers ---");
const services = await broker.inference.listService();
services.forEach((service, index) => {
  console.log(
    `[${index}] ${service.provider}  model=${service.model ?? "?"}  url=${service.url ?? "?"}`
  );
});
if (services.length === 0) {
  console.error("no providers returned by listService()");
  process.exit(1);
}

const requested = process.argv[2] ?? process.env.ZEROG_COMPUTE_PROVIDER;
const chosen = requested
  ? services.find((s) => s.provider.toLowerCase() === requested.toLowerCase()) ??
    services[Number(requested)] ??
    services[0]
  : services[0];

console.log("");
console.log("chosen provider", chosen.provider);

try {
  const ledger = await broker.ledger.getLedger();
  console.log("ledger existing", plain(ledger).slice(0, 200));
} catch {
  console.log("no ledger yet — creating one with", LEDGER_OG, "OG");
  await broker.ledger.addLedger(LEDGER_OG);
  console.log("ledger created");
}

try {
  await broker.ledger.depositFund(LEDGER_OG);
  console.log("deposited      ", LEDGER_OG, "OG");
} catch (err) {
  console.log("depositFund skipped:", err.message.slice(0, 120));
}

try {
  await broker.ledger.transferFund(
    chosen.provider,
    "inference",
    ethers.parseEther(String(TRANSFER_OG))
  );
  console.log("transferred    ", TRANSFER_OG, "OG to the provider sub-account");
} catch (err) {
  console.log("transferFund skipped:", err.message.slice(0, 120));
}

const meta = await broker.inference.getServiceMetadata(chosen.provider);
console.log("endpoint       ", meta.endpoint);
console.log("model          ", meta.model);

const headers = await broker.inference.getRequestHeaders(chosen.provider);
const res = await fetch(`${meta.endpoint}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({
    messages: [
      { role: "system", content: "Reply with the single word OK." },
      { role: "user", content: "ping" },
    ],
    model: meta.model,
    temperature: 0,
  }),
});

console.log("inference HTTP ", res.status);
const body = await res.text();
if (!res.ok) {
  console.error(body.slice(0, 400));
  process.exit(1);
}

const data = JSON.parse(body);
const answer = data.choices?.[0]?.message?.content ?? "";
console.log("answer         ", JSON.stringify(answer).slice(0, 120));

const chatId = res.headers.get("ZG-Res-Key") || data.id;
const valid = chatId ? await broker.inference.processResponse(chosen.provider, chatId) : false;
console.log("TEE attested   ", valid);

setEnvVar("ZEROG_COMPUTE_PROVIDER", chosen.provider);
console.log("");
console.log("wrote ZEROG_COMPUTE_PROVIDER into .env.local");
console.log("restart the agent loop, then re-run recurring_fault");
