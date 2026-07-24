# Verimesh

The safety + coordination layer that lets an AI autonomously manage a **decentralized physical‑infrastructure (DePIN) network** without anyone having to trust it. The AI proposes, a deterministic verifier disposes (physics **and** economics), a World‑ID‑verified human breaks ties, every decision is written immutably to **0G**, and every settlement between operators is paid trustlessly on **Hedera**.

Built for ETHGlobal Lisbon 2026. Target tracks: **World**, **0G**, **Hedera (AI & Agentic Payments)**.

## Architecture

- **Frontend** — Next.js + React Three Fiber. A live 3D mesh of nodes, reasoning trace, balances/settlement feed, and the World ID human‑authorization gate. Reads Supabase only.
- **Supabase** — Postgres + Realtime. The operational source of truth the frontend subscribes to.
- **Agent service** — a Node loop: read telemetry, detect anomalies (rules), diagnose + propose (LLM via 0G Compute), verify against the blueprint (physics + economics), commit or freeze for a human.
- **Chains** — 0G Compute (attested inference), 0G Storage (immutable audit), Hedera (HTS settlement between operators).

## Structure

```
apps/web            frontend (Next.js + R3F)
services/agent      the agent loop
services/mcp        MCP server exposing the agent tools
packages/shared     types, zod schema, physics, economics, blueprint  (frozen contract)
packages/sim        telemetry simulator
packages/verifier   verify_constraints (physics + economic invariants)
packages/chain      0G + Hedera clients
supabase            schema migrations
docs                planning + spec artifacts
```

## Getting started

```
pnpm install
pnpm typecheck
```

Copy `.env.example` to `.env` and fill in the Supabase, World, 0G, and Hedera values, then apply `supabase/migrations/0001_init.sql`.

## AI attribution

AI coding assistants were used during this hackathon for scaffolding, boilerplate, and drafting, under human direction and review. The planning and specification artifacts that guided the build are included in [`docs/`](docs/). All work was produced during the event. Team members should review and expand this section before submission to reflect exactly where and how AI was used.
