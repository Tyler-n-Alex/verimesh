# subgraph

Indexes the `VerimeshRegistry` events on **Base Sepolia** into a queryable GraphQL API. This is the agent's trustless memory (`get_history`) and the operators' audit surface.

This is a standalone npm project — it is **not** part of the pnpm workspace. Run `npm install` inside `subgraph/`, not `pnpm install` at the root.

## State (B2.3 done · B2.4 blocked)

- `abis/VerimeshRegistry.json` — hand-written from `contracts/VerimeshRegistry.sol`.
- `src/mappings.ts` — all four handlers, plus the three accumulator entities.
- `subgraph.yaml` — event signatures match the ABI byte for byte; `network: base-sepolia`.
- `npx graph codegen && npx graph build` both pass.
- **Missing: `address` and `startBlock` in `subgraph.yaml`.** They are still `0x000…` and `0`. B2.1 has to deploy the registry first. `startBlock: 0` would make the node rescan the whole chain — take the block number off the deploy receipt.

## Deploy (B2.4 — ~10 minutes once the address exists)

```
cd subgraph
npm install
npx graph auth <SUBGRAPH_DEPLOY_KEY>
npx graph codegen && npx graph build
npx graph deploy verimesh
```

Create the subgraph in Subgraph Studio first to get the slug and the deploy key. Deploying gives a **development query URL** → that is `SUBGRAPH_URL` / `NEXT_PUBLIC_SUBGRAPH_URL`, and publishing it unblocks A3.5, A5, B6.2, B7 and C5.1.

**Do not run `graph publish`.** Publishing to the decentralized network is mainnet-only, and a testnet-indexing subgraph can never be published.

Re-run `graph codegen` after any change to `schema.graphql` or the ABI — stale generated types are the most common way this toolchain wastes an hour.

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
