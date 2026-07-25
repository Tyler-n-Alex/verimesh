---
name: base
description: Base Sepolia — the chain the Verimesh registry deploys to. Use for any task touching the deploy wallet, faucet, Hardhat/Foundry/solc toolchain, `VerimeshRegistry.sol` deployment, `commitDecision` / `freezeNode` / `resolveOverride` transactions, nonce handling, Basescan links or contract verification. The subgraph that indexes this chain is the `subgraph` skill; 0G Compute/Storage are the `zerog` skill.
---

# Base Sepolia — the registry chain

Covers tasks `B2.0`, `B2.1`, `B2.2`, `B6.5`, and the handoff that unblocks `B2.3`/`B2.4` (owner: C).

> **Docs verified 2026-07-25** against <https://docs.base.org/base-chain/quickstart/connecting-to-base>,
> the Base network-faucets page, and the Foundry/Hardhat install docs. If a command fights you,
> re-read the live docs and **update this file**.

## Why we are on Base at all

Base is not a sponsor track for us — it is **infrastructure**. The registry lives here for exactly
one reason: The Graph indexes `base-sepolia`, and it does not index 0G Chain. See
[`../subgraph/SKILL.md`](../subgraph/SKILL.md) for that decision.

So do **not** oversell Base in the submission, and do not under-sell it either: the honest line is
*"the decision record is emitted on Base Sepolia because that is where The Graph can serve it; the
immutable payload lives on 0G, and every emitted event carries its 0G root."* Arbitrum Sepolia
(`421614`) is a drop-in substitute — identical code, different faucet. Take whichever funds first.

## Network

| | |
|---|---|
| Chain ID | **84532** |
| RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |
| Gas token | ETH (testnet) |
| Block time | ~2s |
| The Graph slug | `base-sepolia` |
| EVM | Prague-level since Isthmus (Apr 2025) — `cancun` is safe to target |

The public RPC is **rate-limited and has no WebSocket**. That is fine for a deploy and a few dozen
commits; it is not fine for an event-subscription loop. We do not need one — the subgraph is the
read path, and the registry is write-only from our side. If anyone proposes `provider.on(...)`
against `sepolia.base.org`, that is the bug.

## `B2.0` — the wallet is the schedule risk, not the gas

Deploy plus a hundred `Committed` events costs a rounding error on Base Sepolia. **The risk is
faucet friction, not cost.** Claim from two faucets at the start of B2 so a rate limit at 02:00 is
not a blocker:

| Faucet | Drip | Cooldown | Needs |
|---|---|---|---|
| Coinbase CDP — <https://portal.cdp.coinbase.com/products/faucet> | up to 0.1 ETH | 24h | free CDP account |
| Ethereum Ecosystem — <https://www.ethereum-ecosystem.com/faucets/base-sepolia> | 0.5 ETH | 24h | no login |
| Chainstack — <https://faucet.chainstack.com/> | 0.5 ETH | 24h | Chainstack API key |
| Alchemy — <https://basefaucet.com/> | — | 24h | free Alchemy account |
| QuickNode — <https://faucet.quicknode.com/drip> | — | 12h | — |

**This is a different wallet from the 0G one.** Two chains, two keys, two faucets:
`REGISTRY_PRIVATE_KEY` ≠ `ZEROG_PRIVATE_KEY`. Crossing them produces an "insufficient funds" error
on a wallet you are certain you funded, and you will lose twenty minutes to it.

## `B2.1` — deploying `VerimeshRegistry.sol`

Three paths. Pick by what is already installed, not by preference.

### Path A · solc + ethers, zero new toolchain *(recommended)*

`ethers@6` is already a dependency and the contract has no imports, so a framework buys us nothing.
This compiles, deploys, prints the address **and the deploy block**, and writes the ABI where the
subgraph needs it — in one script, no init wizard, no Windows toolchain questions.

```bash
pnpm add -D -w solc@0.8.28
```

`contracts/deploy.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { ethers } from "ethers";

const source = readFileSync("contracts/VerimeshRegistry.sol", "utf8");

const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "VerimeshRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
})));

const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));

const artifact = out.contracts["VerimeshRegistry.sol"].VerimeshRegistry;
const provider = new ethers.JsonRpcProvider(process.env.REGISTRY_CHAIN_RPC);
const wallet = new ethers.Wallet(process.env.REGISTRY_PRIVATE_KEY, provider);

const factory = new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, wallet);
const contract = await factory.deploy();
const receipt = await contract.deploymentTransaction().wait();

writeFileSync("subgraph/abis/VerimeshRegistry.json", JSON.stringify(artifact.abi, null, 2));
console.log(await contract.getAddress(), receipt.blockNumber, receipt.hash);
```

```bash
node --env-file=.env.local contracts/deploy.mjs
```

The `solc` npm package is the compiler itself, not a wrapper — `solc@0.8.28` satisfies the
contract's `pragma ^0.8.20`. Pin `evmVersion` explicitly rather than inheriting the solc default;
the default drifts between releases and you want the deployed bytecode to be reproducible when C
verifies it.

### Path B · Hardhat 3

Viable, but `contracts/` is **not** in `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `services/*`) —
add `- "contracts"` there before installing, or you get a stray npm-managed `node_modules`.
`artifacts/` and `cache/` are already gitignored.

```ts
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  solidity: { version: "0.8.28", settings: { evmVersion: "cancun" } },
  networks: {
    baseSepolia: {
      type: "http",
      chainId: 84532,
      url: configVariable("REGISTRY_CHAIN_RPC"),
      accounts: [configVariable("REGISTRY_PRIVATE_KEY")],
    },
  },
});
```

⚠️ **Do not install `@nomicfoundation/hardhat-keystore`.** `configVariable()` reads plain
environment variables by default, which is what we want; the keystore plugin replaces that with an
**interactive password prompt** that hangs any non-interactive or agent-driven run and gives no
useful error. Hardhat 3 also defaults to a **viem** toolbox, so a copy-pasted `ethers`-flavoured
deploy script from a tutorial will not resolve.

### Path C · Foundry

Straight from Base's own docs, and the fastest path *if `forge` is already on PATH*:

```bash
cast wallet import deployer --interactive
forge create ./contracts/VerimeshRegistry.sol:VerimeshRegistry \
  --rpc-url https://sepolia.base.org --account deployer --broadcast
```

Two traps: **`--broadcast` is required** — without it `forge create` is a dry run that prints a
plausible-looking address that does not exist. And on Windows, `foundryup` **requires Git Bash or
WSL — PowerShell and cmd are unsupported**, and the binaries land in `~/.foundry/bin`, which
PowerShell will not have on PATH even after a successful install. Not worth discovering at 14:00.

## `B2.2` — prove it with one event

```js
const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, abi, wallet);
const tx = await registry.commitDecision(
  ethers.id("seed-decision-1"),
  "node-7", "operator-a", "throttle", "safe", 1, ethers.ZeroHash,
);
const receipt = await tx.wait();
console.log(`${process.env.REGISTRY_EXPLORER}/tx/${receipt.hash}`);
```

`id` and `zerogRoot` are `bytes32`, not strings. `ethers.id(s)` is keccak256 of the UTF-8 bytes and
always produces a valid 32-byte value; `DecisionRecord.id` in `packages/shared` is a `string`, so
hash it at the boundary rather than hoping the value happens to be 32 bytes. When there is no 0G
blob yet, pass `ethers.ZeroHash` — never `"0x0"`, which reverts on ABI encoding.

Open the tx on Basescan and confirm the `Committed` event decodes with the right field order. That
decoded log is the ground truth C's `subgraph.yaml` must match; if the field order here disagrees
with `schema.graphql`, the mapping silently indexes nothing.

## `B6.5` — the commit path, and the bug you will hit

The agent writes Supabase, uploads the 0G blob, then emits `Committed`. Registry write is **last**
and must never block the loop: wrap it so a chain failure degrades to `chainTxHash: undefined`
rather than killing the decision. A missing tx hash is a visibly incomplete audit row; a thrown
exception is a dead demo.

**Serialize the sends.** Two concurrent commits from one wallet fetch the same nonce and the second
dies with `nonce too low` or `replacement transaction underpriced` — intermittent, load-dependent,
and it will surface exactly when a judge triggers two incidents at once. One module-level promise
chain in `packages/chain` fixes it:

```js
let queue = Promise.resolve();

export function send(fn) {
  const next = queue.then(fn, fn);
  queue = next.then(() => undefined, () => undefined);
  return next;
}
```

Let ethers estimate gas. Hardcoding `gasPrice` on an OP Stack chain — where the L1 data fee is the
larger component and moves independently — is how you get a transaction stuck in the mempool for
the length of the demo.

## Handoff — what B2.1 owes C

C cannot start `B2.3`/`B2.4` without all four. Publish them together, in the board, the moment the
deploy receipt lands:

| Artifact | Goes to |
|---|---|
| contract address | `REGISTRY_ADDRESS`, `subgraph.yaml` `source.address` |
| **deploy block number** | `subgraph.yaml` `startBlock` |
| ABI JSON array | `subgraph/abis/VerimeshRegistry.json` |
| network slug `base-sepolia` | `subgraph.yaml` `network` |

The block number is the one people forget. `startBlock: 0` makes the indexer re-scan the chain from
genesis and your seeded event does not appear for a very long time — which reads exactly like a
broken mapping, so you debug the wrong file.

## Basescan verification — optional, do it last

The subgraph needs the **ABI file**, not a verified contract, so nothing is blocked on this. It is
a nice-to-have for judges clicking through to a readable contract.

Etherscan's V2 API is unified: **one key for every chain**, with `chainid` selecting the network
(`https://api.etherscan.io/v2/api?chainid=84532`, browser `https://sepolia.basescan.org`). Old
per-explorer Basescan keys and the V1 `api-sepolia.basescan.org` endpoint still float around in
tutorials — if a verify call 404s or complains about the key, that is why.

## Env

```
REGISTRY_CHAIN_RPC=https://sepolia.base.org
REGISTRY_CHAIN_ID=84532
REGISTRY_ADDRESS=
REGISTRY_PRIVATE_KEY=
REGISTRY_EXPLORER=https://sepolia.basescan.org
```

`REGISTRY_EXPLORER` is what the audit drawer builds links from — `/tx/<hash>` and
`/address/<addr>`. Do not hardcode the host in a component; the whole point is that we could move
this contract to Arbitrum Sepolia in ten minutes if a faucet dies.

## Repo rules

No comments in source files (`CLAUDE.md`). Snippets above are comment-free — keep them that way.

## Sources

- Network details — <https://docs.base.org/base-chain/quickstart/connecting-to-base>
- Deploying on Base — <https://docs.base.org/base-chain/quickstart/deploy-on-base>
- Faucets — <https://docs.base.org/base-chain/tools/network-faucets>
- Foundry install (Windows caveat) — <https://getfoundry.sh/introduction/installation/>
- Hardhat 3 config variables — <https://hardhat.org/docs/explanations/configuration-variables>
- Isthmus / Prague on OP Stack — <https://docs.optimism.io/notices/upgrade-15>
- Etherscan V2 unified API — <https://docs.etherscan.io/contract-verification/verify-with-hardhat>
