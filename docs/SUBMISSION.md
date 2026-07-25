# Verimesh — submission draft

Status: **draft**. Placeholders marked `TODO` are blocked on a task and must be filled before
submission (Sun 09:00 WEST). Nothing in this file should claim something we have not run.

---

## One sentence

An autonomous agent manages a 3D mesh of DePIN infrastructure nodes: the LLM proposes fixes, a
deterministic verifier disposes, and World ID humans break ties — with authorization that scales
with the blast radius. Every decision is committed on-chain and indexed by a subgraph the agent
itself queries as trustless memory, and every reasoning blob is written immutably to 0G.

---

## The two rehearsed booth lines (plan §1B)

### 1 · The "why does this need a blockchain?" kill-shot

> "Because independent operators don't trust each other, the central API, or the AI. 0G makes the
> record un-forgeable; The Graph makes it independently queryable by anyone; World proves a real
> human authorized the exceptions — and for anything that crosses an operator boundary, that it was
> **two different** real humans, which is a thing no wallet and no login can prove. Remove them and
> a multi-party network can't trust an AI's account of what it did, or reason over it. Our agent
> literally queries that trustless memory before it acts."

### 2 · The memory line

> "Watch the second scenario. Same fault signature, different node. The agent queries the subgraph
> for that node's history, finds the prior incidents, and cites them in its reasoning — and because
> the history says repeat offender, the *same safe action* now costs a human signature that it
> didn't cost the first time. History doesn't just change the diagnosis; it changes how much human
> authority the fix requires. That is the subgraph being load-bearing, not decorative."

---

## The seam we say out loud, rather than hide

> "The decision record is indexed where The Graph can serve it — Base Sepolia, because 0G Chain is
> not on The Graph's supported-networks list. The immutable payload lives on 0G, and every indexed
> row carries its 0G root. The substantive 0G work is TEE-attested inference and immutable audit
> storage; the registry is a contract that only emits."

## Wording we must get exactly right

- **"A custom MCP server exposing our subgraph as an agent-queryable memory tool."** Not "The
  Graph's Subgraph MCP server" — that one only reaches subgraphs published to the decentralized
  network, and publishing is mainnet-only. Judges will check.
- **World ID v4**, not v3: verification is a POST to the Developer Portal, and the uniqueness field
  is `nullifier`.

---

## Tracks

| Track | What we built |
|---|---|
| **World** | Differential authorization: T0 autonomous / T1 single human on the operator's allowlist / T2 two **distinct** nullifiers when the projected effect crosses operators. Distinctness is enforced in three places — the policy, a unique database index, and a `revert DuplicateNullifier` on-chain. |
| **0G** | TEE-attested inference through 0G Compute for the single LLM decision, and the full reasoning blob in 0G Storage; every indexed decision row carries its `zerogRoot`. |
| **The Graph** | A Studio-hosted subgraph over the decision registry, queried by the agent as memory (`get_history`, via our own MCP server) and by operators as a trustless audit surface. |

---

## What makes the demo honest (acceptance harness, `pnpm --filter @verimesh/verifier acceptance`)

- **Subgraph-truth check** — every decision committed on-chain comes back from a GraphQL query with
  matching fields. What the agent *remembers* equals what actually happened.
- **Quorum-truth check** — the on-chain `HumanApproval` events for a resolved override contain
  exactly the distinct nullifiers the policy demanded. What the chain says was authorized equals
  what the policy required.
- **Property suites** — `fast-check` over the verifier (a VERIFIED action never projects a state
  that breaches a physical invariant) and over the authorization policy (a cross-operator action
  never resolves on fewer than two distinct nullifiers; a T1/T2 action never resolves on a
  nullifier off the affected operator's allowlist; the per-human budget is never exceeded).

---

## To paste before submitting

- Subgraph query endpoint: `TODO` (B2.4)
- Sample GraphQL query + its real response: `TODO` (B2.4)
- Registry address on Base Sepolia + Basescan links: `TODO` (B2.1)
- Decision tx hashes from the recorded run: `TODO` (B6.5)
- 0G Storage roots that resolve: `TODO` (B4)
- Video link: `TODO`
- `README.md` AI-attribution section reviewed by a human: `TODO`
