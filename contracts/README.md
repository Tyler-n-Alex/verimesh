# contracts

Minimal EVM registry that emits one event per verified decision. It is the on-chain write source that The Graph indexes.

## Spike steps (B2)

1. Init a toolchain here: `npx hardhat init` (or `forge init`).
2. Deploy `VerimeshRegistry.sol` to **0G Chain** testnet (EVM). Record the address and deploy block.
3. Copy the compiled ABI to `../subgraph/abis/VerimeshRegistry.json`.
4. Update `../subgraph/subgraph.yaml` with the address, `startBlock`, and network name.
5. From the agent's `commit_state`, call `commitDecision` / `freezeNode` / `recordOverride`.

Keep it minimal: the events are the point. Do not add per-node storage unless a query needs it.
