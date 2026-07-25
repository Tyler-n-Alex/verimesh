# subgraph

Indexes the `VerimeshRegistry` events on **Base Sepolia** into a queryable GraphQL API. This is the agent's trustless memory (`get_history`) and the operators' audit surface.

## Spike steps (B2)

1. After deploying the registry, drop its ABI at `./abis/VerimeshRegistry.json` and set the address / `startBlock` / `network` in `subgraph.yaml`.
2. `pnpm install` then `pnpm codegen` to generate types from the schema + ABI.
3. Implement `./src/mappings.ts` (`handleCommitted`, `handleFrozen`, `handleHumanOverride`) to write `Decision` / `Freeze` / `Override` entities.
4. Deploy to **Subgraph Studio**: `graph auth <DEPLOY_KEY>` then `graph deploy verimesh`. Use the development query URL as `SUBGRAPH_URL`. Do not run `graph publish` — publishing is mainnet-only.
5. Wire the agent to **our own MCP server** in `services/mcp` so `get_history(nodeId, operator)` queries the deployed subgraph. The Graph's `subgraph-mcp` cannot be used: it queries the network gateway by subgraph ID and only serves published (mainnet) subgraphs.

The `mappings.ts` file is generated against codegen output, so it is created during the spike, not scaffolded here.
