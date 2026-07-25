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

const decisions = [
  {
    label: "history-node09-incident-1",
    nodeId: "node-09",
    operator: "opA",
    action: "THROTTLE_NODE",
    verdict: "VERIFIED",
  },
  {
    label: "history-node09-incident-2",
    nodeId: "node-09",
    operator: "opA",
    action: "THROTTLE_NODE",
    verdict: "VERIFIED",
  },
  {
    label: "history-node07-scaleup-1",
    nodeId: "node-07",
    operator: "opA",
    action: "SCALE_UP",
    verdict: "VERIFIED",
  },
  {
    label: "history-node02-throttle-1",
    nodeId: "node-02",
    operator: "opA",
    action: "THROTTLE_NODE",
    verdict: "VERIFIED",
  },
];

for (const d of decisions) {
  const id = ethers.id(d.label);
  const tx = await registry.commitDecision(
    id,
    d.nodeId,
    d.operator,
    d.action,
    d.verdict,
    0,
    ethers.ZeroHash
  );
  const receipt = await tx.wait();
  console.log(`${d.label.padEnd(28)} ${explorer}/tx/${receipt.hash}`);
}
