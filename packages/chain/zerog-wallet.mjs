import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const ENV_PATH = "../../.env.local";
const FAUCETS = [
  "https://faucet.0g.ai",
  "https://cloud.google.com/application/web3/faucet/0g/galileo",
];

function setEnvVar(key, value) {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(raw) ? raw.replace(pattern, line) : `${raw.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, next);
}

const rpc = process.env.ZEROG_RPC;
if (!rpc) throw new Error("ZEROG_RPC is not set");

let key = process.env.ZEROG_PRIVATE_KEY;
let wallet;

if (key) {
  try {
    wallet = new ethers.Wallet(key);
    console.log("ZEROG_PRIVATE_KEY is already set and valid");
  } catch {
    throw new Error("ZEROG_PRIVATE_KEY is set but is not a valid private key — clear it and re-run");
  }
} else {
  wallet = ethers.Wallet.createRandom();
  setEnvVar("ZEROG_PRIVATE_KEY", wallet.privateKey);
  console.log("generated a new 0G wallet and wrote ZEROG_PRIVATE_KEY into .env.local");
}

const provider = new ethers.JsonRpcProvider(rpc);
const balance = await provider.getBalance(wallet.address);
const chainId = (await provider.getNetwork()).chainId;

console.log("");
console.log("address   ", wallet.address);
console.log("chain     ", chainId.toString(), chainId === 16602n ? "(Galileo)" : "(UNEXPECTED — Galileo is 16602)");
console.log("balance   ", ethers.formatEther(balance), "OG");
console.log("");

if (balance === 0n) {
  console.log("This wallet is empty. Fund it, then re-run this script to confirm:");
  for (const url of FAUCETS) console.log(`  ${url}`);
  console.log("");
  console.log("The cap is 0.1 OG per wallet per day, which is enough for the demo.");
  process.exit(1);
}

console.log("Funded. Next: node --env-file=../../.env.local zerog-setup.mjs");
