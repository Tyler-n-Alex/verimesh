import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import {
  AUTH_TIER_CODE,
  normalizeNullifier,
  type AuthTier,
  type DecisionRecord,
  type HumanApproval,
} from "@verimesh/shared";
import type { AcceptanceInput, ResolvedGate } from "../acceptance";

interface GateRecord {
  proposal_id: number;
  required_tier: string;
  required_quorum: number;
  operators_required: string[] | null;
  reason: string | null;
}

async function gateRecordsByChainId(): Promise<Map<string, GateRecord>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const out = new Map<string, GateRecord>();
  if (!url || !key) return out;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("human_gates")
    .select("proposal_id,required_tier,required_quorum,operators_required,reason");

  if (error) {
    console.warn(`could not read human_gates: ${error.message}`);
    return out;
  }

  for (const row of (data ?? []) as GateRecord[]) {
    out.set(ethers.id(`proposal-${row.proposal_id}`).toLowerCase(), row);
  }
  return out;
}

const RPC_MAX_BLOCK_RANGE = 1900;
const RPC_MAX_ATTEMPTS = 7;
const RPC_BACKOFF_BASE_MS = 600;
const RPC_BACKOFF_MAX_MS = 15_000;
const RPC_BACKOFF_JITTER_MS = 250;
const RPC_CHUNK_PACE_MS = Number(process.env.REGISTRY_RPC_PACE_MS ?? 120);

const EVENT_ABI = [
  "event Committed(bytes32 indexed id, string nodeId, string operator, string action, string verdict, uint8 authTier, bytes32 zerogRoot, uint256 ts)",
  "event Frozen(bytes32 indexed id, string nodeId, string operator, string reason, uint8 requiredTier, uint8 requiredQuorum, uint256 ts)",
  "event HumanApproval(bytes32 indexed id, bytes32 worldIdNullifier, string operator, uint8 approvalIndex, uint256 ts)",
  "event OverrideResolved(bytes32 indexed id, string chosenAction, uint8 approvalsCollected, uint256 ts)",
];

function tierFromCode(code: number): AuthTier {
  const match = (Object.keys(AUTH_TIER_CODE) as AuthTier[]).find(
    (tier) => AUTH_TIER_CODE[tier] === code
  );
  return match ?? "T0_AUTONOMOUS";
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(err: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (value: unknown): boolean => {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const record = value as { code?: unknown; message?: unknown; error?: unknown; info?: unknown };
    if (record.code === -32016 || record.code === 429) return true;
    if (
      typeof record.message === "string" &&
      /rate limit|too many requests/i.test(record.message)
    ) {
      return true;
    }
    return walk(record.error) || walk(record.info);
  };
  return walk(err);
}

async function withRateLimitRetry<T>(
  label: string,
  attempt: () => Promise<T>
): Promise<T> {
  let delay = RPC_BACKOFF_BASE_MS;
  for (let tries = 1; ; tries += 1) {
    try {
      return await attempt();
    } catch (err) {
      if (!isRateLimited(err) || tries >= RPC_MAX_ATTEMPTS) throw err;
      console.error(
        `  rate limited on ${label}, retry ${tries}/${RPC_MAX_ATTEMPTS - 1} in ${Math.round(delay)}ms`
      );
      await sleep(delay + Math.random() * RPC_BACKOFF_JITTER_MS);
      delay = Math.min(delay * 2, RPC_BACKOFF_MAX_MS);
    }
  }
}

const EVENT_NAMES = [
  "Committed",
  "Frozen",
  "HumanApproval",
  "OverrideResolved",
] as const;

type EventName = (typeof EVENT_NAMES)[number];

async function collectAll(
  provider: ethers.JsonRpcProvider,
  registry: ethers.Contract,
  address: string,
  from: number,
  head: number
): Promise<Record<EventName, ethers.EventLog[]>> {
  const iface = registry.interface;
  const fragments = new Map<string, ethers.EventFragment>();

  for (const name of EVENT_NAMES) {
    const fragment = iface.getEvent(name);
    if (!fragment) throw new Error(`${name} is missing from the registry ABI`);
    fragments.set(fragment.topicHash, fragment);
  }

  const out: Record<EventName, ethers.EventLog[]> = {
    Committed: [],
    Frozen: [],
    HumanApproval: [],
    OverrideResolved: [],
  };

  const topics = [[...fragments.keys()]];
  let first = true;

  for (let start = from; start <= head; start += RPC_MAX_BLOCK_RANGE) {
    const end = Math.min(start + RPC_MAX_BLOCK_RANGE - 1, head);
    if (!first) await sleep(RPC_CHUNK_PACE_MS);
    first = false;

    const logs = await withRateLimitRetry(`registry ${start}-${end}`, () =>
      provider.getLogs({ address, topics, fromBlock: start, toBlock: end })
    );

    for (const log of logs) {
      const fragment = fragments.get(log.topics[0]);
      if (!fragment) continue;
      out[fragment.name as EventName].push(
        new ethers.EventLog(log, iface, fragment)
      );
    }
  }

  return out;
}

async function main(): Promise<void> {
  const rpc = process.env.REGISTRY_CHAIN_RPC;
  const address = process.env.REGISTRY_ADDRESS;
  const startBlock = Number(argValue("--from") ?? process.env.REGISTRY_START_BLOCK ?? 0);
  const out = argValue("--out") ?? "chain-snapshot.json";

  if (!rpc) throw new Error("REGISTRY_CHAIN_RPC is not set");
  if (!address) throw new Error("REGISTRY_ADDRESS is not set");
  if (!startBlock) throw new Error("pass --from <deploy block>");

  const provider = new ethers.JsonRpcProvider(rpc);
  const registry = new ethers.Contract(address, EVENT_ABI, provider);
  const head = await provider.getBlockNumber();

  const gateRecords = await gateRecordsByChainId();

  const span = head - startBlock + 1;
  const chunks = Math.ceil(span / RPC_MAX_BLOCK_RANGE);
  console.log(
    `scanning ${span} block(s) in ${chunks} chunk(s) of ${RPC_MAX_BLOCK_RANGE}, all ${EVENT_NAMES.length} events per call`
  );

  const events = await collectAll(provider, registry, address, startBlock, head);
  const committed = events.Committed;
  const frozen = events.Frozen;
  const approved = events.HumanApproval;
  const resolved = events.OverrideResolved;

  const decisions: DecisionRecord[] = committed.map((log) => ({
    id: log.args.id as string,
    nodeId: log.args.nodeId as string,
    operator: log.args.operator as string,
    action: log.args.action as string,
    verdict: log.args.verdict as string,
    humanAuthorized: Number(log.args.authTier) > 0,
    authTier: tierFromCode(Number(log.args.authTier)),
    approvals: [],
    zerogRoot: log.args.zerogRoot as string,
    chainTxHash: log.transactionHash,
    ts: Number(log.args.ts),
  }));

  const gates: ResolvedGate[] = resolved.map((log) => {
    const id = log.args.id as string;
    const freeze = frozen.find((f) => (f.args.id as string) === id);
    const approvals: HumanApproval[] = approved
      .filter((a) => (a.args.id as string) === id)
      .map((a) => ({
        nullifier: normalizeNullifier(a.args.worldIdNullifier as string),
        operator: a.args.operator as string,
        chosenAction: log.args.chosenAction as string,
        ts: Number(a.args.ts),
      }));

    const record = gateRecords.get(id.toLowerCase());

    const operatorsRequired = record?.operators_required?.length
      ? [...record.operators_required].sort()
      : Array.from(new Set(approvals.map((a) => a.operator))).sort();

    return {
      decisionId: id,
      chosenAction: log.args.chosenAction as string,
      requirementSource: record ? "gate-record" : "chain-derived",
      requirement: {
        tier: (record?.required_tier as ResolvedGate["requirement"]["tier"]) ??
          tierFromCode(Number(freeze?.args.requiredTier ?? 0)),
        quorum:
          record?.required_quorum ??
          Number(freeze?.args.requiredQuorum ?? approvals.length),
        operatorsRequired,
        reason:
          record?.reason ??
          (freeze?.args.reason as string) ??
          "no Frozen event indexed for this gate",
      },
      approvals,
    };
  });

  const input: AcceptanceInput = { decisions, gates };
  writeFileSync(out, JSON.stringify(input, null, 2) + "\n");

  console.log(
    `${decisions.length} decision(s), ${gates.length} resolved gate(s), ${approved.length} approval(s) read straight from ${address} between ${startBlock} and ${head}`
  );
  console.log(`wrote ${out}`);
  const fromRecords = gates.filter((g) => g.requirementSource === "gate-record").length;
  console.log(
    `${fromRecords}/${gates.length} gate requirement(s) came from human_gates — those are independently checked. The rest were reconstructed from the chain, where the Frozen event carries requiredTier and requiredQuorum but not operatorsRequired.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
