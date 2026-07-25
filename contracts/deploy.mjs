import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { ethers } from "ethers";

const RPC = process.env.REGISTRY_CHAIN_RPC;
const KEY = process.env.REGISTRY_PRIVATE_KEY;

if (!RPC) throw new Error("REGISTRY_CHAIN_RPC is not set");
if (!KEY) throw new Error("REGISTRY_PRIVATE_KEY is not set — run contracts/wallet.mjs first");

const source = readFileSync("contracts/VerimeshRegistry.sol", "utf8");

const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "VerimeshRegistry.sol": { content: source } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "cancun",
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    })
  )
);

const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));

const artifact = out.contracts["VerimeshRegistry.sol"].VerimeshRegistry;

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(KEY, provider);

const balance = await provider.getBalance(wallet.address);
console.log(`deployer ${wallet.address} · ${ethers.formatEther(balance)} ETH`);
if (balance === 0n) {
  throw new Error(
    `${wallet.address} has no balance on ${RPC} — fund it from a Base Sepolia faucet first`
  );
}

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.evm.bytecode.object,
  wallet
);
const contract = await factory.deploy();
const receipt = await contract.deploymentTransaction().wait();
const address = await contract.getAddress();

writeFileSync(
  "subgraph/abis/VerimeshRegistry.json",
  JSON.stringify(artifact.abi, null, 2) + "\n"
);

const manifestPath = "subgraph/subgraph.yaml";
const manifest = readFileSync(manifestPath, "utf8")
  .replace(/address: "0x[0-9a-fA-F]*"/, `address: "${address}"`)
  .replace(/startBlock: \d+/, `startBlock: ${receipt.blockNumber}`);
writeFileSync(manifestPath, manifest);

const envPath = ".env.local";
const env = readFileSync(envPath, "utf8").replace(
  /^REGISTRY_ADDRESS=.*$/m,
  `REGISTRY_ADDRESS=${address}`
);
writeFileSync(envPath, env);

const explorer = process.env.REGISTRY_EXPLORER ?? "https://sepolia.basescan.org";

console.log(`\nREGISTRY_ADDRESS=${address}`);
console.log(`deploy block:     ${receipt.blockNumber}`);
console.log(`tx:               ${explorer}/tx/${receipt.hash}`);
console.log(`contract:         ${explorer}/address/${address}`);
console.log(`\nwrote subgraph/abis/VerimeshRegistry.json`);
console.log(`patched subgraph/subgraph.yaml (address + startBlock)`);
console.log(`patched .env.local (REGISTRY_ADDRESS)`);
