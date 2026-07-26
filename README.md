# Verimesh

The safety + coordination layer that lets an AI autonomously manage a **decentralized physical‑infrastructure (DePIN) network** without anyone having to trust it. The AI proposes, a deterministic verifier disposes, a World‑ID‑verified human breaks ties, every decision is written immutably to **0G**, committed on‑chain, and indexed by a **subgraph the agent itself queries as trustless memory**.

Built for ETHGlobal Lisbon 2026. Target tracks: **World**, **0G**, **The Graph**.

## Architecture

- **Frontend** — Next.js + React Three Fiber. A live 3D mesh of nodes, reasoning trace, per‑operator history/audit views (GraphQL), and the World ID human‑authorization gate. Reads Supabase + The Graph.
- **Supabase** — Postgres + Realtime. The operational source of truth the frontend subscribes to.
- **Agent service** — a Node loop: read telemetry, detect anomalies (rules), query history (The Graph), diagnose + propose (LLM via 0G Compute), verify against the blueprint, commit or freeze for a human.
- **Chains / data** — 0G Compute (attested inference), 0G Storage (immutable audit blobs), a registry contract on **Base Sepolia** (decision events — 0G Chain isn't on The Graph's supported-networks list, so the registry lives where The Graph can index it, while every event still carries the 0G root), The Graph (a subgraph indexing the registry into queryable, trustless memory).

## Structure

```
apps/web            frontend (Next.js + R3F)
services/agent      the agent loop
services/mcp        MCP server (incl. The Graph history query)
packages/shared     types, zod schema, physics, blueprint  (frozen contract)
packages/sim        telemetry simulator
packages/verifier   verify_constraints (physical invariants)
packages/chain      0G + Base Sepolia registry + The Graph clients
contracts           Solidity decision registry (Base Sepolia)
subgraph            The Graph subgraph indexing the registry
supabase            schema migrations
docs                planning + spec artifacts
TASKS               the shared task board — who is doing what, right now
```

## Working on this

**Start at [`TASKS/BOARD.md`](TASKS/BOARD.md).** It holds the schedule, the gates, the blockers, and
the update protocol. Your tasks live in your stream file (`TASKS/STREAM-A.md`, `-B`, `-C`).
`docs/` is the spec; `TASKS/` is the plan of record — if they disagree, the board wins.

AI coding assistants working in this repo must read `TASKS/BOARD.md` before starting, keep their
owner's stream file up to date as they work, and push after every status change.

## Getting started

```
pnpm install
pnpm typecheck
```

Copy `.env.example` to **`.env.local`** and fill in the Supabase, World, 0G, registry-chain and subgraph values. `.env.local` is the single env file for the whole monorepo — Next.js loads it automatically and the service scripts read it via `--env-file`.

Apply `supabase/migrations/0001_init.sql` then `0002_authz.sql`, then seed the mesh:

```
pnpm --filter @verimesh/agent seed
```

## AI attribution

**AI wrote the bulk of the code in this repository. The humans did the thinking that decided what the code should be.**

We want to be precise about the split, because it is the honest one and we think it is the interesting one.

**The team owns the concept and every consequential decision.** The core idea — that an autonomous agent managing shared physical infrastructure needs authorization that scales with the blast radius of its actions, and that "which human" is a different question from "is this a human" — is ours. So is the system architecture: the split between a probabilistic proposer and a deterministic verifier, the T0/T1/T2 authorization model, the decision to enforce nullifier distinctness in three independent places, and the choice to make the agent query its own indexed history rather than trust its local database.

The team also made every technology decision and every engineering trade-off: the stack, the choice of sponsor integrations and how each one earns its place, moving the registry to Base Sepolia when The Graph turned out not to support 0G Galileo, writing our own MCP server once we established that The Graph's could not query a testnet endpoint, and setting the physical bounds and thresholds the whole demo rests on. When AI proposed something that was wrong, unsafe, or dishonest about what the system actually did, a human caught it and overruled it.

**AI was the execution layer.** Given a specified design, it wrote the implementation — contracts, mappings, API routes, the agent loop, the 3D front end, tests — and was extremely effective at it. It also did a lot of the debugging legwork under direction.

The planning and specification artifacts that guided the build are in [`docs/`](docs/), and the task board and stream files in [`TASKS/`](TASKS/) are the real working record of who decided what and when. All work was produced during the event.
