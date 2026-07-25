# subgraph

Indexes the `VerimeshRegistry` events on 0G Chain into a queryable GraphQL API. This is the agent's trustless memory (`get_history`) and the operators' audit surface.

## Spike steps (B2)

1. After deploying the registry, drop its ABI at `./abis/VerimeshRegistry.json` and set the address / `startBlock` / `network` in `subgraph.yaml`.
2. `pnpm install` then `pnpm codegen` to generate types from the schema + ABI.
3. Implement `./src/mappings.ts` (`handleCommitted`, `handleFrozen`, `handleHumanOverride`) to write `Decision` / `Freeze` / `Override` entities.
4. Deploy: Subgraph Studio if 0G Chain is supported, else a local `graph-node` via docker-compose (`create-local` + `deploy-local`).
5. Wire the agent to The Graph Subgraph MCP server so `get_history(nodeId, operator)` queries the deployed subgraph.

The `mappings.ts` file is generated against codegen output, so it is created during the spike, not scaffolded here.
