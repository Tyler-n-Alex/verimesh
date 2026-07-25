---
name: zerog
description: 0G integration for Verimesh — 0G Compute attested LLM inference and 0G Storage audit blobs. Use for any task touching 0G, the compute broker, TEE attestation, zerogRoot, ZgFile, or the inference call. Note the decision registry lives on Base Sepolia, not 0G Chain — see the subgraph skill.
---

# 0G — Compute, Storage, Chain

Covers plan §9 B3/B4, §2. Tasks `B3`, `B4`, `B6.3`, `B6.5`.

> **🚨 Scope change, 25 Jul: the registry contract is no longer on 0G Chain.** The Graph does not
> support 0G Chain, so the registry moved to Base Sepolia — see the `subgraph` skill. **0G Compute
> and 0G Storage are unchanged and are our entire 0G integration.** The section below on 0G Chain
> is kept for reference only; do not deploy the registry there.
>
> The link survives in the data: the `Committed` event carries `zerogRoot`, so every indexed
> decision points back into 0G Storage. That is the sentence to say at the booth.

> **Docs verified 2026-07-25** against <https://docs.0g.ai/developer-hub/building-on-0g/>.
> If an import fails, re-read the live docs and **update this file**.

## ⚠️ The plan cites the wrong npm scope

The base plan's appendix says `@0glabs/0g-ts-sdk`. Current packages are under **`@0gfoundation`**:

| Purpose | Package |
|---|---|
| Compute (inference) | `@0gfoundation/0g-compute-ts-sdk` |
| Storage | `@0gfoundation/0g-storage-ts-sdk` |

## 0G Chain — Galileo testnet *(reference only — we do not deploy here)*

| | |
|---|---|
| Chain ID | **16602** |
| RPC | `https://evmrpc-testnet.0g.ai` |
| Explorer | `https://chainscan-galileo.0g.ai` |
| Gas token | test OG (faucet caps ~0.1/day/wallet) |
| Solidity | EVM-equivalent; 0.8.19+, cancun target, deploys unchanged |

Chain IDs 16600 / 16601 / 80087 appear in older posts; **16602** is current.

Compute and Storage still need a funded 0G wallet — the broker's `depositFund` / `transferFund`
and every storage upload cost gas. **The ~0.1/day faucet cap is a real schedule risk: claim tokens
at the start of `B3`, not when a transaction fails at 02:00.**

## 0G Compute — attested inference

This is the strongest 0G story we have: the LLM decision is **verifiable**, not just remote.

```ts
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

const provider = new ethers.JsonRpcProvider(process.env.ZEROG_RPC!);
const wallet = new ethers.Wallet(process.env.ZEROG_PRIVATE_KEY!, provider);
const broker = await createZGComputeNetworkBroker(wallet);
```

Fund once at setup, then transfer to the provider sub-account. `transferFund` also
auto-acknowledges the provider's TEE signer on-chain, so no separate acknowledge step is needed.

```ts
await broker.ledger.depositFund(10);
await broker.ledger.transferFund(providerAddress, "inference", BigInt(1) * BigInt(10 ** 18));
```

Discover providers, then call:

```ts
const services = await broker.inference.listService();

const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
const headers = await broker.inference.getRequestHeaders(providerAddress);

const response = await fetch(`${endpoint}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ messages, model }),
});

const data = await response.json();
const answer = data.choices[0].message.content;
```

Then verify the TEE signature — **this is the part that matters for judging**:

```ts
const chatID = response.headers.get("ZG-Res-Key") || data.id;
const isValid = chatID ? await broker.inference.processResponse(providerAddress, chatID) : false;
```

Write `isValid` into `proposals.zerog_inference_valid` (the column already exists in
`0001_init.sql`) and **surface it in the UI trace**. An unverified inference is just an API call;
the attestation is the claim.

`getRequestHeaders` produces **single-use** headers. Generate fresh headers per request — reusing
them fails, and it fails in a way that looks like an auth bug.

### Fallback

`LLM_PROVIDER` in `.env.example` switches between `zerog` and OpenAI/Anthropic. Put both behind
one interface in `packages/chain` so a broker outage during the demo is a one-env-var recovery,
not a code change. Demo on 0G; keep the fallback armed.

## 0G Storage — the audit blob

```ts
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";

const indexer = new Indexer(process.env.ZEROG_INDEXER!);
const provider = new ethers.JsonRpcProvider(process.env.ZEROG_RPC!);
const signer = new ethers.Wallet(process.env.ZEROG_PRIVATE_KEY!, provider);
```

From a file path:

```ts
const file = await ZgFile.fromFilePath(filePath);
const [tree, treeErr] = await file.merkleTree();
const rootHash = tree?.rootHash();
const [tx, uploadErr] = await indexer.upload(file, process.env.ZEROG_RPC!, signer);
await file.close();
```

Download:

```ts
const err = await indexer.download(rootHash, outputPath, true);
```

Every SDK call returns a **`[value, error]` tuple, not a throw**. Destructure and check
`uploadErr` / `treeErr` explicitly — an ignored tuple gives you an `undefined` root hash that
propagates all the way to a broken explorer link in the demo. Always `await file.close()`.

The `rootHash` is our `zerogRoot` — it goes into `commits.zerog_root`, into the registry
`Committed` event, and into the audit drawer as a link.

## What goes where — do not blur these

| Store | Holds | Why |
|---|---|---|
| **Supabase** | hot operational state | the live loop and the 3D read it; low latency |
| **0G Compute** | the LLM decision itself | TEE-attested — the inference is verifiable, not just remote |
| **0G Storage** | full reasoning blob, immutable | no single operator can forge the record |
| **Registry (Base Sepolia)** | one event per decision, carrying `zerogRoot` | the write source The Graph can index |
| **The Graph** | queryable history | independently queryable by any operator |

Judges will ask why all four. The answer is that they do different jobs: Supabase is fast but
trusted, 0G Storage is un-forgeable but not queryable, the subgraph is queryable but lags. See
`.claude/skills/subgraph/SKILL.md`.

## Env

```
ZEROG_RPC=https://evmrpc-testnet.0g.ai
ZEROG_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
ZEROG_PRIVATE_KEY=
ZEROG_COMPUTE_PROVIDER=
LLM_PROVIDER=zerog
```

`REGISTRY_CHAIN_RPC` / `REGISTRY_ADDRESS` are **not** 0G — they point at Base Sepolia. Two chains,
two wallets, two faucets. Do not cross the private keys.

## Repo rules

No comments in source files (`CLAUDE.md`). Snippets above are comment-free — keep them that way.

## Sources

- Compute SDK — <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference>
- Storage SDK — <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk>
- Testnet overview — <https://docs.0g.ai/developer-hub/testnet/testnet-overview>
- Chain settings — <https://chainlist.org/chain/16602>
