# subgraph

Indexes the `VerimeshRegistry` events on **Base Sepolia** into a queryable GraphQL API. This is the agent's trustless memory (`get_history`) and the operators' audit surface.

This is a standalone npm project — it is **not** part of the pnpm workspace. Run `npm install` inside `subgraph/`, not `pnpm install` at the root.

## State

- `abis/VerimeshRegistry.json` — hand-written from `contracts/VerimeshRegistry.sol`.
- `src/mappings.ts` — all four handlers, plus the three accumulator entities.
- `subgraph.yaml` — event signatures match the ABI byte for byte; `network: base-sepolia`, registry at `0x0Fb557580E7C01Aed5D02622558216B9eb19c33c`, `startBlock: 44613204`.
- `npx graph codegen && npx graph build` both pass.
- **Hosted on Goldsky**, not Subgraph Studio — see below.

## Why not Subgraph Studio

A testnet subgraph can never be published to the decentralized network (publishing is mainnet-only), so Studio's **development query URL is the only endpoint it can ever have** — and that endpoint is rate limited. The agent loop, the authz budget reads, the audit views and the acceptance harness all draw on the same budget, and the frontend's 60s poll against a 60s cache TTL meant almost every poll missed.

Goldsky's free **Starter** tier has no query quota — only a **20 requests / 10 seconds** burst limit, roughly 100x our steady-state load — plus 3 custom subgraphs, 2,250 worker hours (≈3 always-on) and 100,000 stored entities. Base Sepolia is supported under the same `base-sepolia` slug, so **the manifest, schema and mappings are unchanged**. Only the host moved.

This is still a real subgraph running real `graph-node`; it is not hosted by The Graph. Say it that way — *"our subgraph, indexed by graph-node, hosted on Goldsky"* — rather than implying Studio or the decentralized network.

## Deploy

```
cd subgraph
npm install
goldsky login
npm run goldsky:deploy
```

`goldsky:deploy` runs `graph codegen && graph build` first, then `goldsky subgraph deploy verimesh-base-sepolia/1.0.0 --path . --tag prod`.

`goldsky login` opens a browser — it cannot run headless or under an agent. For CI use `goldsky login --token <API_KEY>` with a key from the Goldsky dashboard.

**Use the `prod` tag, not the raw version, in every env var.** The endpoint is:

```
https://api.goldsky.com/api/public/project_<PROJECT_ID>/subgraphs/verimesh-base-sepolia/prod/gn
```

Redeploying `1.0.0` under the same tag keeps that URL valid. The Studio URL pinned the version (`…/verimesh-base-sepolia/v0.0.1`), so every redeploy silently invalidated `SUBGRAPH_URL` in five places. Get the project id from `npm run goldsky:status`.

Backfill from `startBlock: 44613204` covers the blocks since the registry was deployed. It is only ~500 `eth_getLogs` calls, not a block-by-block rescan — the subgraph has event handlers only, one contract, no call or block handlers. Watch it with `npm run goldsky:logs`.

Re-run `graph codegen` after any change to `schema.graphql` or the ABI — stale generated types are the most common way this toolchain wastes an hour.

**The local `graph-node` path is still the offline fallback.** `create-local` / `deploy-local` point at `localhost:8020`; `deploy-local` carries `--version-label` because `graph deploy` otherwise prompts for one and hangs forever on a non-TTY shell.

## Entity keys

| Entity | id | Why |
|---|---|---|
| `Decision` | the contract's `bytes32 id`, hex | the agent and the audit drawer look decisions up by the id they already hold; a duplicate `Committed` is skipped rather than crashing the indexer on an immutable entity |
| `Freeze` | `txHash-logIndex` | queried through `decisionId`, and a gate can be frozen more than once |
| `Approval` | `decisionId-approvalIndex` | one row per distinct signer; `resolveOverride` is idempotent on-chain so these cannot collide |
| `Override` | the contract's `bytes32 id`, hex | one resolution per gate, enforced by `OverrideAlreadyResolved` |
| `HumanAuthority` | the nullifier, hex | mutable accumulator — `overrideCount` is the per-human budget input for `authz.ts` |
| `NodeHistory` | `nodeId` | mutable accumulator — `incidentCount` is the repeat-offender input for `authz.ts` |
| `Operator` | the operator id | mutable accumulator for the per-operator views |

`Decision.humanAuthorized` is derived: `authTier > 0`. The `Committed` event does not carry it.

## After deploy

Wire the agent to **our own MCP server** in `services/mcp` so `get_history(nodeId, operator)` queries the deployed subgraph. The Graph's `subgraph-mcp` cannot be used: it queries the network gateway by subgraph ID and only serves published (mainnet) subgraphs.

Then run `pnpm --filter @verimesh/verifier acceptance` with `SUBGRAPH_URL` set — the C5.1 subgraph-truth check is what proves the indexed history matches what was actually committed.
