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

AI coding assistants were used during this hackathon for scaffolding, boilerplate, and drafting, under human direction and review. The planning and specification artifacts that guided the build are included in [`docs/`](docs/). All work was produced during the event. Team members should review and expand this section before submission to reflect exactly where and how AI was used.
