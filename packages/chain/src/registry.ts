import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { AUTH_TIER_CODE, type AuthTier } from "@verimesh/shared";
import { withTimeout } from "./retry";

const CHAIN_CALL_TIMEOUT_MS = Number(
  process.env.CHAIN_CALL_TIMEOUT_MS ?? 45_000
);
const CHAIN_SEND_ATTEMPTS = Number(process.env.CHAIN_SEND_ATTEMPTS ?? 3);
const RPC_RETRIES = Number(process.env.CHAIN_RPC_RETRIES ?? 4);
const RPC_TIMEOUT_MS = Number(process.env.CHAIN_RPC_TIMEOUT_MS ?? 12_000);
const CHAIN_SEND_BACKOFF_MS = Number(
  process.env.CHAIN_SEND_BACKOFF_MS ?? 1500
);

async function broadcast(
  label: string,
  build: (attempt: number) => Promise<ethers.ContractTransactionResponse>
): Promise<string | undefined> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CHAIN_SEND_ATTEMPTS; attempt++) {
    let tx: ethers.ContractTransactionResponse;
    try {
      tx = await build(attempt - 1);
    } catch (err) {
      lastError = err;
      if (attempt === CHAIN_SEND_ATTEMPTS) break;
      console.warn(
        `[chain] ${label} was not broadcast on attempt ${attempt} of ${CHAIN_SEND_ATTEMPTS}, retrying: ${
          err instanceof Error ? err.message.slice(0, 120) : String(err)
        }`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, CHAIN_SEND_BACKOFF_MS * attempt)
      );
      continue;
    }

    const receipt = await tx.wait();
    return receipt?.hash as string | undefined;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} was not broadcast`);
}

function chainFailure(label: string) {
  return (err: unknown): undefined => {
    console.error(
      `[chain] ${label} did not land — the decision continues without it:`,
      err instanceof Error ? err.message : err
    );
    return undefined;
  };
}

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

export function endpointsOf(config: RegistryConfig): string[] {
  const list = config.rpc
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return list.length > 0 ? list : [config.rpc];
}

function providerFor(url: string): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(url);
  request.timeout = RPC_TIMEOUT_MS;
  request.retryFunc = async (_req, response, attempt) => {
    if (attempt >= RPC_RETRIES) return false;
    if (response.statusCode !== 429 && response.statusCode < 500) return false;
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    return true;
  };
  return new ethers.JsonRpcProvider(request, undefined, {
    staticNetwork: true,
  });
}

function getContract(config: RegistryConfig, attempt = 0) {
  const urls = endpointsOf(config);
  const provider = providerFor(urls[attempt % urls.length]);
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
      const idBytes = ethers.id(params.id);
      const rootBytes = params.zerogRoot.startsWith("0x")
        ? params.zerogRoot
        : ethers.id(params.zerogRoot);

      return broadcast("commitDecision", (attempt) =>
        getContract(config, attempt).commitDecision(
          idBytes,
          params.nodeId,
          params.operator,
          params.action,
          params.verdict,
          AUTH_TIER_CODE[params.authTier],
          rootBytes.length === 66 ? rootBytes : ethers.ZeroHash
        )
      );
    }),
    CHAIN_CALL_TIMEOUT_MS
  ).catch(chainFailure("commitDecision"));
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
      const idBytes = ethers.id(params.id);
      return broadcast("freezeNode", (attempt) =>
        getContract(config, attempt).freezeNode(
          idBytes,
          params.nodeId,
          params.operator,
          params.reason,
          AUTH_TIER_CODE[params.requiredTier],
          params.requiredQuorum
        )
      );
    }),
    CHAIN_CALL_TIMEOUT_MS
  ).catch(chainFailure("freezeNode"));
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
      const idBytes = ethers.id(params.id);
      const nullifierBytes = params.nullifiers.map((n) => {
        if (n.startsWith("0x") && n.length === 66) return n;
        return ethers.zeroPadValue(ethers.toBeHex(BigInt(n)), 32);
      });

      return broadcast("resolveOverride", (attempt) =>
        getContract(config, attempt).resolveOverride(
          idBytes,
          params.chosenAction,
          nullifierBytes,
          params.operators
        )
      );
    }),
    CHAIN_CALL_TIMEOUT_MS
  ).catch(chainFailure("resolveOverride"));
}

export function registryFromEnv(): RegistryConfig | null {
  const rpc = process.env.REGISTRY_CHAIN_RPC;
  const privateKey = process.env.REGISTRY_PRIVATE_KEY;
  const address = process.env.REGISTRY_ADDRESS;
  if (!rpc || !privateKey || !address) return null;
  return { rpc, privateKey, address };
}
