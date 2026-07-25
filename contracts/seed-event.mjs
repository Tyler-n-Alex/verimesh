import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const RPC = process.env.REGISTRY_CHAIN_RPC;
const KEY = process.env.REGISTRY_PRIVATE_KEY;
const ADDRESS = process.env.REGISTRY_ADDRESS;

if (!RPC) throw new Error("REGISTRY_CHAIN_RPC is not set");
if (!KEY) throw new Error("REGISTRY_PRIVATE_KEY is not set");
if (!ADDRESS) throw new Error("REGISTRY_ADDRESS is not set — deploy first");

const abi = JSON.parse(readFileSync("subgraph/abis/VerimeshRegistry.json", "utf8"));
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(KEY, provider);
const registry = new ethers.Contract(ADDRESS, abi, wallet);
const explorer = process.env.REGISTRY_EXPLORER ?? "https://sepolia.basescan.org";

const decisionId = ethers.id("seed-decision-1");

const commit = await registry.commitDecision(
  decisionId,
  "node-07",
  "opA",
  "THROTTLE_NODE",
  "VERIFIED",
  0,
  ethers.ZeroHash
);
const commitReceipt = await commit.wait();
console.log(`Committed  ${explorer}/tx/${commitReceipt.hash}`);

const gateId = ethers.id("seed-gate-1");

const freeze = await registry.freezeNode(
  gateId,
  "node-07",
  "opA",
  "isolating opA node-07 would breach opB node-12",
  2,
  2
);
const freezeReceipt = await freeze.wait();
console.log(`Frozen     ${explorer}/tx/${freezeReceipt.hash}`);

const resolve = await registry.resolveOverride(
  gateId,
  "SCALE_UP",
  [
    "0x00000000000000000000000000000000000000000000000000000000000a11ce",
    "0x0000000000000000000000000000000000000000000000000000000000000b0b",
  ],
  ["opA", "opB"]
);
const resolveReceipt = await resolve.wait();
console.log(`Resolved   ${explorer}/tx/${resolveReceipt.hash}`);

console.log(`\ndecisionId ${decisionId}`);
console.log(`gateId     ${gateId}`);
console.log(`block      ${commitReceipt.blockNumber}`);
