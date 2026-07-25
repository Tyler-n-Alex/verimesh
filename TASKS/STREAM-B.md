# Stream B — backend / web3

Owner: `@____` · Protocol + cut order: [`BOARD.md`](BOARD.md) · Spec: plan §9

**You are the critical path.** Everything in the plan ships — the constraint is your hours, not the
scope. Do the G1 rebalance in `BOARD.md`: **B4 + B5.1 move to A, B2.3 + B2.4 move to C.** They are
still listed here because they are your dependencies; tick them when the new owner lands them.

Order below is the order to do it in. B2 starts early and runs in parallel with everything.

---

## Sat 13:30 → 15:00 · make the loop have something to loop over

- [ ] **B0** Seed Supabase from `genio_blueprint.json` — nodes + edges, two operators (`opA`, `opB`)
      · 30m · needs: H0.5 · unblocks: A1, B1
- [ ] **B1** Simulator tick → `telemetry` + `nodes.metrics` writes on an interval; fault injection
      hook for scenarios · 60m · needs: B0 · unblocks: A2, C1

---

## Sat 13:30 → 17:00 · **B2 · THE SPIKE** (run this in parallel with B0/B1 — it is the biggest risk)

New toolchain, hard gate. **G2 is 17:00 and it is hard.** Do not blow through it debugging.

- [ ] **B2.1** Hardhat (or Foundry) project in `contracts/`; deploy `VerimeshRegistry` to
      **0G Chain testnet**; record `REGISTRY_ADDRESS` in `.env.example` · 45m · needs: H0.2
- [ ] **B2.2** Script emits one `Committed` event; confirm the tx in the 0G explorer · 15m · needs: B2.1
- [ ] **B2.3** Subgraph: `subgraph.yaml` pointed at the deployed address + AssemblyScript mappings
      for all four events · 60m · needs: H0.3, B2.1 · **owner: C** (G1 rebalance)
- [ ] **B2.4** Deploy the subgraph — ⚠️ **local `graph-node` via docker-compose against the 0G Chain
      RPC. This is the primary path, NOT the fallback.** 0G Chain is not on The Graph's
      supported-networks list, so **Subgraph Studio will reject it**. Query in GraphiQL and get
      B2.2's seeded event back · 60m · needs: B2.3 · **owner: C** · ⚠️ **feeds G2 at 17:00**
- [ ] **B2.4a** Pull the docker images (graph-node + IPFS + Postgres) **in the background now**,
      while B2.3 is being written. Do not start this at 16:45 · 5m
- [ ] **B2.5** ⚠️ **G2 · 17:00 GO/NO-GO.** This is a *chain-selection* contingency, not a feature
      cut — the subgraph ships either way. If B2.4 is not green, take the ladder **in order, now**:
      1. redeploy the registry to a network that **is** on The Graph's supported-networks list and
         index that instead — 0G keeps Compute + Storage, only the registry's host chain moves.
         **Check the live list first; do not assume Sepolia or Arbitrum Sepolia are on it.**
      2. mirror history in Supabase, subgraph stays a read-only proof of the pipeline
      · needs: B2.4
- [ ] **B2.6** Publish `SUBGRAPH_URL` to the team — **A is blocked on this** and A cannot build the
      history views without it. If it will be late, give A a hand-written fixture response at 15:00
      so A can build against the shape · 10m · unblocks: A3.5, A5

---

## Sat 15:00 → 19:00 · 0G

- [ ] **B3** 0G Compute — broker setup, one attested inference call, `zerog_inference_valid` written
      to `proposals`; provider fallback (OpenAI/Anthropic) behind the same interface · 90m · unblocks: B6
- [ ] **B4** 0G Storage — write the full reasoning blob, store `zerog_root` · 45m · needs: B3
      · **owner: A** (G1 rebalance)

---

## Sat 18:00 → 22:00 · World ID (plan §9 B5 + §1D)

- [ ] **B5.1** `/api/worldid/sign` (RP context via `signRequest`) + `/api/worldid/verify`
      (POST `developer.world.org/api/v4/verify/{rp_id}`) · 45m · **owner: A** (G1 rebalance — it
      lives in A's Next.js app) · ⚠️ **the plan's `verifyCloudProof` is the v3 API and is gone —
      see the `world-id` skill.** The widget cannot open without a backend-signed `rp_context`, so
      **this blocks A3.6.1** · unblocks: A3.6.1
- [ ] **B5.2** Valid proof → record a `HumanApproval` (nullifier + enrolled operator) against the
      open `human_gate` · 45m · needs: B5.1, H0.5
- [ ] **B5.3** Wire C's `authz.ts` into the freeze branch: verdict + projected blast radius →
      `AuthorizationRequirement` · 30m · needs: C3
- [ ] **B5.4** **T1 end-to-end** — single human, allowlist checked, gate resolves, commit proceeds
      · 45m · needs: B5.2, B5.3
- [ ] **B5.5** **T2 quorum** — gate stays open until it holds the required *distinct* nullifiers,
      one per affected operator; **reject a repeat nullifier**; emit `HumanApproval` per accepted
      signer + `OverrideResolved` on resolution · 90m · needs: B5.4 · **protect this — it is the World edge**
- [ ] **B5.6** Enrol both World ID identities (2 phones, or 1 phone + the **World ID Simulator**)
      into `authz_config.json`, one per operator · 20m · **do this early, not at 4am** · unblocks: B5.5
- [ ] **B5.7** ✦ Subgraph-fed policy inputs (plan §9 B5 stretch, §1D) — before opening a gate, query
      the subgraph over **plain GraphQL** (not the agent's MCP tool — the one-LLM-decision invariant
      must hold) for: (a) the node's incident count → escalate the tier for a repeat offender,
      (b) each signer's recent override count → enforce `budgetPerWindow` · 60m · needs: B5.5, B2.6, C3

---

## Sat 20:00 → Sun 02:00 · the loop

- [ ] **B6.1** Agent loop skeleton — `services/agent/src/index.ts` is a 1-line stub; wire
      telemetry → detect (deterministic rules, no LLM) · 60m · needs: B1
- [ ] **B6.2** `get_history(nodeId, operator)` against the subgraph, behind a single interface;
      feed the result into the diagnose context. Land it on **plain GraphQL** first so the loop is
      unblocked, then B7 swaps the transport underneath · 45m · needs: B2.6 · unblocks: B7
- [ ] **B6.3** Diagnose + propose — the **one** LLM decision, via B3, telemetry + history in context
      · 45m · needs: B3, B6.2
- [ ] **B6.4** `verify_constraints` call → C's verifier · 15m · needs: C1
- [ ] **B6.5** `commit_state` — Supabase + 0G Storage blob + **registry `Committed` event** carrying
      `authTier`; store `chain_tx_hash` · 60m · needs: B2.1, B4
- [ ] **B6.6** Freeze branch — VIOLATION / low confidence → authz policy → collect quorum →
      re-verify → commit · 60m · needs: B5.5, B6.5
- [ ] **B7.1** Write a **Verimesh MCP server** in `services/mcp` (currently a 1-line stub) exposing
      `get_history` over our subgraph's GraphQL endpoint · 45m · needs: B2.6
      · ⚠️ **The Graph's own `subgraph-mcp` cannot reach our subgraph** — it queries the Graph
      Network gateway by subgraph ID only, with no arbitrary-endpoint option. Plan §0's "query via
      The Graph's Subgraph MCP server" is not achievable; ours is. See the `subgraph` skill.
- [ ] **B7.2** Point B6.2's interface at the MCP tool so the agent's step 3 goes through MCP
      · 30m · needs: B7.1, B6.2
- [ ] **B7.3** Write the submission line **accurately**: "a custom MCP server exposing our subgraph
      as agent-queryable memory" — **not** "we used The Graph's Subgraph MCP server." Judges check
      · 5m · needs: B7.2

---

## Sun 02:00 → 06:00 · harden

- [ ] **B8.1** Headless scenario runner — `ambiguous_cascade` and `recurring_fault` run start to
      finish with no human at the keyboard except the World ID scans · 60m · needs: C2, B6.6
- [ ] **B8.2** Retry/timeout on every network call (0G broker, RPC, subgraph). One flaky call must
      not kill the demo · 45m
- [ ] **B8.3** Seed a handful of historical decisions on-chain so `get_history` has real depth on
      stage · 20m
