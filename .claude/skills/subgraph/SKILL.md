---
name: subgraph
description: The Graph integration for Verimesh — the Base Sepolia registry contract, subgraph manifest/schema/AssemblyScript mappings, Subgraph Studio deployment, GraphQL history queries, and the custom MCP get_history tool. Use for any task touching The Graph, subgraphs, graph-cli, indexing, GraphQL, agent memory, or the registry contract.
---

# The Graph — the agent's trustless memory

Covers plan §6.2, §6.3, §9 B2/B6/B7, §8 A3.5/A5, §9C. Tasks `B2.*`, `B6.2`, `B7.*`, `A3.5.*`,
`A5.*`, `C5.1`.

> **Docs verified 2026-07-25** against <https://thegraph.com/docs/en/subgraphs/quick-start/> and
> the supported-networks list. If the toolchain fights you, re-read the live docs and **update
> this file**.

## 🚨 The registry is NOT on 0G Chain — decided 25 Jul

**0G Chain / Galileo is not on The Graph's supported-networks list**, so Subgraph Studio rejects it.
Rather than self-host a `graph-node` (docker + IPFS + Postgres, 1–3h, and a live dependency on the
demo laptop), **the registry deploys to a Studio-supported testnet** and Studio hosts the subgraph.

**Default: Base Sepolia** (`84532`, RPC `https://sepolia.base.org`, explorer
`https://sepolia.basescan.org`). Arbitrum Sepolia (`421614`) is equally fine — take whichever
faucet funds you first, the code is identical.

Faucets, the deploy toolchain, and the commit-transaction path live in
[`../base/SKILL.md`](../base/SKILL.md). This file owns everything downstream of the deploy receipt.

**This does not weaken the 0G integration.** 0G Compute (TEE-attested inference) and 0G Storage
(immutable audit blobs) are untouched, and those are the substantive 0G work — the registry is a
contract that only `emit`s. The `Committed` event still carries `zerogRoot`, so **every indexed row
points into 0G Storage**.

Say the seam out loud rather than hiding it: *"the decision record is indexed where The Graph can
serve it; the immutable payload lives on 0G, and every indexed row carries its 0G root."*

**If Studio deploy fails at G2 (17:00):** fall back to local `graph-node` via docker-compose against
the same RPC. Same manifest, same mappings — only the host changes. Last resort: mirror history in
Supabase and keep the subgraph as a read-only proof.

## The pipeline

```
agent commit → registry contract (Base Sepolia) → event  ─┐
                                                          │ carries zerogRoot
0G Storage blob ──────────────────────────────────────────┘
             → Studio-hosted subgraph indexes → entities
             → GraphQL  ─┬─→ agent get_history  (step 3 of the loop)
                         └─→ frontend audit views
```

The Graph is the **history** layer, never the live path. Supabase owns hot state. Indexing lag is
by design — if anyone proposes reading node status from the subgraph, that is a bug.

## The contract is the schema

`contracts/VerimeshRegistry.sol` emits the ✦ event set (after `H0.2`):

```solidity
event Committed(bytes32 indexed id, string nodeId, string operator, string action, string verdict, uint8 authTier, bytes32 zerogRoot, uint256 ts);
event Frozen(bytes32 indexed id, string nodeId, string operator, string reason, uint8 requiredTier, uint8 requiredQuorum, uint256 ts);
event HumanApproval(bytes32 indexed id, bytes32 worldIdNullifier, string operator, uint8 approvalIndex, uint256 ts);
event OverrideResolved(bytes32 indexed id, string chosenAction, uint8 approvalsCollected, uint256 ts);
```

`resolveOverride` **must revert on a duplicate nullifier**. That is where quorum distinctness
becomes un-fakeable — backend checks can be bypassed, a reverting transaction cannot.

Three artifacts must agree exactly: the **event signature**, the **`schema.graphql` entity**, and
the **`DecisionRecord` type** in `packages/shared`. Change one, change all three in the same
commit. A silent drift here shows up as an empty GraphQL result at 03:00 with no error anywhere.

## Toolchain

```
npm install -g @graphprotocol/graph-cli@latest
graph --version
graph init
graph codegen && graph build
graph auth <DEPLOY_KEY>
graph deploy verimesh
```

⚠️ **`graph auth <DEPLOY_KEY>` hangs forever on the version this repo pins.** `subgraph/package.json`
pins `@graphprotocol/graph-cli@^0.80`, whose signature is `graph auth [NODE] [DEPLOY-KEY]` — a single
positional argument is read as the **node URL**, and the CLI then waits on an interactive prompt for
the key. Under an agent or any non-TTY shell that is an indefinite hang with no output, not an error.

On 0.80.x the working form is:

```
npx graph auth --studio <DEPLOY_KEY>
```

It warns that `--studio` is removed in the next major — that warning is correct, and the bare
`graph auth <DEPLOY_KEY>` above is the >=0.9x form. **Check `npx graph --version` before copying
either line.** Verified working on 0.80.1, 25 Jul: `Deploy key set for
https://api.studio.thegraph.com/deploy/`.

Create the subgraph in Subgraph Studio first to get the slug and `DEPLOY_KEY`
(→ `SUBGRAPH_DEPLOY_KEY`). Deploying gives a **development query URL** → `SUBGRAPH_URL`.

Do **not** attempt `graph publish`. Publishing to the decentralized network is mainnet-only — a
testnet-indexing subgraph cannot be published, which is also why The Graph's own MCP server can
never reach ours (see below). The Studio dev endpoint is all we need and all we can have.

`graph codegen` regenerates `../generated/*` from the ABI + schema. **Re-run it after every
contract or schema change** — stale generated types are the single most common way this toolchain
wastes an hour.

## Manifest

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: VerimeshRegistry
    network: mainnet
    source:
      address: '0x...'
      abi: VerimeshRegistry
      startBlock: 0
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Decision
        - Freeze
        - Approval
        - Override
        - HumanAuthority
      abis:
        - name: VerimeshRegistry
          file: ./abis/VerimeshRegistry.json
      eventHandlers:
        - event: Committed(indexed bytes32,string,string,string,string,uint8,bytes32,uint256)
          handler: handleCommitted
        - event: HumanApproval(indexed bytes32,bytes32,string,uint8,uint256)
          handler: handleHumanApproval
      file: ./src/mapping.ts
```

Two traps in there:

- **`network:`** — must be the exact slug The Graph uses, `base-sepolia` (or `arbitrum-sepolia`).
  **Copy it from the supported-networks page with "Show Testnets" toggled on** — a wrong slug fails
  at deploy time. The `mainnet` in the example above is from The Graph's docs; change it.
- **`startBlock`** — set it to the registry's actual deployment block, not `0`. Starting at 0 makes
  the node re-scan the whole chain and your event will not appear for a very long time. Grab the
  block number from the deploy receipt in `B2.1`.

The event signature in `eventHandlers` must include `indexed` and match the ABI **byte for byte**,
types only, no parameter names. A mismatch does not error — the handler simply never fires.

## Mappings

```ts
import { Committed, HumanApproval } from "../generated/VerimeshRegistry/VerimeshRegistry";
import { Decision, Approval } from "../generated/schema";

export function handleCommitted(event: Committed): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let decision = new Decision(id);
  decision.nodeId = event.params.nodeId;
  decision.operator = event.params.operator;
  decision.action = event.params.action;
  decision.verdict = event.params.verdict;
  decision.authTier = event.params.authTier;
  decision.zerogRoot = event.params.zerogRoot;
  decision.ts = event.params.ts;
  decision.txHash = event.transaction.hash;
  decision.save();
}
```

AssemblyScript, not TypeScript. No closures, no `JSON`, no spread, no union types, no `null` on a
non-nullable. Use `BigInt` and `Bytes` from `@graphprotocol/graph-ts` — never plain `number` for
chain values. `let`, not `const`. If the compiler produces something incomprehensible, the cause is
usually AssemblyScript strictness, not your logic.

`HumanAuthority` (per-nullifier override count) is a **mutable, accumulated** entity — `load()` it,
increment, `save()`. It cannot be `@entity(immutable: true)`. It backs the ✦ budget check in `B5.7`.

## Querying — two paths, one interface

**Frontend (`A3.5`, `A5`)** — plain `fetch` against `SUBGRAPH_URL`. No Apollo; we do not need a
cache and we do not have the hours.

```ts
const res = await fetch(process.env.NEXT_PUBLIC_SUBGRAPH_URL!, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: `query($operator: String!) {
      decisions(where: { operator: $operator }, orderBy: ts, orderDirection: desc, first: 20) {
        id nodeId action verdict authTier zerogRoot ts txHash
      }
    }`,
    variables: { operator },
  }),
});
```

Show the raw query text in the audit drawer (`A5.2`). "Any operator can run this exact query" only
lands if judges can see the query.

**Agent (`B6.2`, `B7`)** — `get_history` behind one interface. Land it on plain GraphQL to unblock
the loop, then expose it as an MCP tool in `B7`.

### ⚠️ The Graph's own Subgraph MCP server cannot reach our subgraph

`graphops/subgraph-mcp` queries **only The Graph Network gateway**, by subgraph ID / deployment ID
/ IPFS hash. It requires `GATEWAY_API_KEY` and exposes `execute_query_by_subgraph_id`,
`get_schema_by_subgraph_id`, `search_subgraphs_by_keyword` and six others. **There is no config
option pointing it at an arbitrary or self-hosted GraphQL endpoint.**

The gateway only serves subgraphs **published to the decentralized network**, and publishing is
**mainnet-only** — a testnet-indexing subgraph can never be published. So plan §0's "Query path:
The Graph's Subgraph MCP server (`get_history` tool)" is unreachable for us on *any* chain we can
realistically use. Moving to Base Sepolia does not change this; nothing short of a mainnet
deployment plus GRT curation would.

**What we do instead:** write a small MCP server in `services/mcp` (already scaffolded) exposing
`get_history` over our subgraph's GraphQL endpoint. Same architecture, same agent-memory story, ~45
minutes. Say it accurately in the submission: *"a custom MCP server exposing our subgraph as an
agent-queryable memory tool"* — **not** "we used The Graph's Subgraph MCP server." Judges will
check, and the custom tool is the better claim anyway: we built the agent-memory interface rather
than wiring an off-the-shelf one.

`GRAPH_MCP_ENDPOINT` in `.env.example` therefore means *our* MCP server's endpoint, not The Graph's.

## The invariant that protects the whole design

**`get_history` is context assembly, not a second decision.** The agent makes exactly **one** LLM
call: diagnose + propose. History goes *into* that call's context. If you find yourself adding a
second LLM call to interpret history, stop — that breaks the core claim and the verifier's
guarantees along with it.

Likewise `B5.7`'s budget and escalation queries are **plain GraphQL from deterministic code**, not
the agent's MCP tool. Same data, different caller, and the distinction is what keeps the
one-decision invariant true.

## `C5.1` — the subgraph-truth check

Every decision committed on-chain must come back from a GraphQL query with matching fields. What
the agent *remembers* must equal what actually happened. This is C's acceptance harness and it is
what makes the memory beat honest rather than asserted — an agent citing history it cannot prove is
exactly the thing this project claims to have solved.

## Env

```
REGISTRY_CHAIN_RPC=https://sepolia.base.org
REGISTRY_CHAIN_ID=84532
REGISTRY_ADDRESS=
REGISTRY_PRIVATE_KEY=
REGISTRY_EXPLORER=https://sepolia.basescan.org
SUBGRAPH_URL=
SUBGRAPH_DEPLOY_KEY=
NEXT_PUBLIC_SUBGRAPH_URL=
GRAPH_MCP_ENDPOINT=
```

`SUBGRAPH_URL` blocks **A3.5, A5, B6.2, B7, C5.1** — five tasks across all three streams. Publish
it the moment it exists (`B2.6`), and hand A a fixture response earlier so A can build against the
shape without waiting.

## Repo rules

No comments in source files (`CLAUDE.md`). Snippets above are comment-free — keep them that way.

## Sources

- Quick start — <https://thegraph.com/docs/en/subgraphs/quick-start/>
- Manifest — <https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/>
- Mappings — <https://thegraph.com/docs/en/subgraphs/developing/creating/assemblyscript-mappings/>
- Supported networks — <https://thegraph.com/docs/en/supported-networks/>
- Local graph-node on any EVM — <https://medium.com/coinmonks/deploy-subgraphs-to-any-evm-aaaccc3559f>
- The Graph AI suite / MCP — <https://thegraph.com/docs/en/ai-suite/ai-introduction>
