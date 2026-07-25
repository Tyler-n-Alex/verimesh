import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const envPath = ".env.local";
const env = readFileSync(envPath, "utf8");
const existing = env.match(/^REGISTRY_PRIVATE_KEY=(.+)$/m);

if (existing && existing[1].trim().length > 0) {
  const wallet = new ethers.Wallet(existing[1].trim());
  console.log(`REGISTRY_PRIVATE_KEY is already set · ${wallet.address}`);
  const provider = new ethers.JsonRpcProvider(process.env.REGISTRY_CHAIN_RPC);
  const balance = await provider.getBalance(wallet.address);
  console.log(`balance ${ethers.formatEther(balance)} ETH`);
  process.exit(0);
}

const wallet = ethers.Wallet.createRandom();

writeFileSync(
  envPath,
  env.replace(/^REGISTRY_PRIVATE_KEY=.*$/m, `REGISTRY_PRIVATE_KEY=${wallet.privateKey}`)
);

console.log(`generated a Base Sepolia deploy wallet and wrote it to .env.local`);
console.log(`\naddress: ${wallet.address}`);
console.log(`\nfund it, then run: node --env-file=.env.local contracts/deploy.mjs`);
console.log(`  https://portal.cdp.coinbase.com/products/faucet`);
console.log(`  https://www.ethereum-ecosystem.com/faucets/base-sepolia`);
