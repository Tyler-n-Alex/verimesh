import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { AUTH_TIER_CODE, type AuthTier } from "@verimesh/shared";
import { withTimeout } from "./retry";

const CHAIN_CALL_TIMEOUT_MS = 30_000;

let queue = Promise.resolve();

export function send<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

const here = dirname(fileURLToPath(import.meta.url));
const abiPath = join(here, "../../../subgraph/abis/VerimeshRegistry.json");

function loadAbi(): ethers.InterfaceAbi {
  return JSON.parse(readFileSync(abiPath, "utf8")) as ethers.InterfaceAbi;
}

export interface RegistryConfig {
  rpc: string;
  privateKey: string;
  address: string;
}

function getContract(config: RegistryConfig) {
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const abi = loadAbi();
  return new ethers.Contract(config.address, abi, wallet);
}

export interface CommitParams {
  id: string;
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  authTier: AuthTier;
  zerogRoot: string;
}

export async function commitDecision(
  config: RegistryConfig,
  params: CommitParams
): Promise<string | undefined> {
  if (!config.address || !config.privateKey) return undefined;

  return withTimeout(
    send(async () => {
      const registry = getContract(config);
      const idBytes = ethers.id(params.id);
      const rootBytes = params.zerogRoot.startsWith("0x")
        ? params.zerogRoot
        : ethers.id(params.zerogRoot);

      const tx = await registry.commitDecision(
        idBytes,
        params.nodeId,
        params.operator,
        params.action,
        params.verdict,
        AUTH_TIER_CODE[params.authTier],
        rootBytes.length === 66 ? rootBytes : ethers.ZeroHash
      );
      const receipt = await tx.wait();
      return receipt?.hash as string | undefined;
    }),
    CHAIN_CALL_TIMEOUT_MS
  ).catch(() => undefined);
}

export interface FreezeParams {
  id: string;
  nodeId: string;
  operator: string;
  reason: string;
  requiredTier: AuthTier;
  requiredQuorum: number;
}

export async function freezeNode(
  config: RegistryConfig,
  params: FreezeParams
): Promise<string | undefined> {
  if (!config.address || !config.privateKey) return undefined;

  return withTimeout(
    send(async () => {
      const registry = getContract(config);
      const idBytes = ethers.id(params.id);
      const tx = await registry.freezeNode(
        idBytes,
        params.nodeId,
        params.operator,
        params.reason,
        AUTH_TIER_CODE[params.requiredTier],
        params.requiredQuorum
      );
      const receipt = await tx.wait();
      return receipt?.hash as string | undefined;
    }),
    CHAIN_CALL_TIMEOUT_MS
  ).catch(() => undefined);
}

export interface ResolveParams {
  id: string;
  chosenAction: string;
  nullifiers: string[];
  operators: string[];
}

export async function resolveOverride(
  config: RegistryConfig,
  params: ResolveParams
): Promise<string | undefined> {
  if (!config.address || !config.privateKey) return undefined;

  return withTimeout(
    send(async () => {
      const registry = getContract(config);
      const idBytes = ethers.id(params.id);
      const nullifierBytes = params.nullifiers.map((n) => {
        if (n.startsWith("0x") && n.length === 66) return n;
        return ethers.zeroPadValue(ethers.toBeHex(BigInt(n)), 32);
      });

      const tx = await registry.resolveOverride(
        idBytes,
        params.chosenAction,
        nullifierBytes,
        params.operators
      );
      const receipt = await tx.wait();
      return receipt?.hash as string | undefined;
    }),
    CHAIN_CALL_TIMEOUT_MS
  ).catch(() => undefined);
}

export function registryFromEnv(): RegistryConfig | null {
  const rpc = process.env.REGISTRY_CHAIN_RPC;
  const privateKey = process.env.REGISTRY_PRIVATE_KEY;
  const address = process.env.REGISTRY_ADDRESS;
  if (!rpc || !privateKey || !address) return null;
  return { rpc, privateKey, address };
}
