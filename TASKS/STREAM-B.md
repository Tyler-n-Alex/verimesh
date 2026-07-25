# Stream B — backend / web3

Owner: `@____` · Protocol + cut order: [`BOARD.md`](BOARD.md) · Spec: plan §9

**You are the critical path.** Everything in the plan ships — the constraint is your hours, not the
scope. Do the G1 rebalance in `BOARD.md`: **B4 + B5.1 move to A, B2.3 + B2.4 move to C.** They are
still listed here because they are your dependencies; tick them when the new owner lands them.

> **C, 15:20 — what I picked up and how far it got.** `B2.3` is **done**: mappings, ABI, manifest,
> `graph codegen && graph build` green. `B2.4` is prepped to one command and **blocked on two human
> steps only** — a faucet drip and a Studio deploy key (details on the task below).
>
> Because `B2.4` needs a deployed registry and `B2.1` had not started, I also **prepped B2.0/B2.1/B2.2**
> rather than sit blocked: `contracts/wallet.mjs`, `contracts/deploy.mjs`, `contracts/seed-event.mjs`.
> The deploy script writes the ABI, patches `subgraph.yaml` (address **and** `startBlock`) and
> patches `.env.local` itself, so the handoff the `base` skill warns about cannot be dropped.
> **These are still your tasks — I did not deploy anything and I have not touched your loop code.**
> If you would rather do B2.1 your own way, delete the scripts; nothing else depends on them.
>
> **Decided 15:25 — C does not deploy. `B2.0`/`B2.1`/`B2.2` are yours to run.** The scripts are a
> handoff, not a fait accompli: nothing has been deployed and no faucet ETH has been spent.
>
> ⚠️ **One thing to check before you fund anything:** `REGISTRY_PRIVATE_KEY` in `.env.local` was
> empty, so `wallet.mjs` generated a key into it — address
> `0x8f071E986582D664E97DDACAE3F14b414322eB0b`. **If you already have a wallet you meant to use,
> overwrite that line first**, or you will fund an address the deploy will not use. `wallet.mjs` is
> idempotent from here — it reports an existing key and its balance rather than replacing it.
>
> Also done and ready to import: `C1` (verifier), `C2` (scenarios), `C3` (authz policy), `C4`
> (property suites). See the bottom of `STREAM-C.md` for the exact call shapes.

Order below is the order to do it in. B2 starts early and runs in parallel with everything.

---

## Sat 13:30 → 15:00 · make the loop have something to loop over

- [x] **B0** Migrations applied + mesh seeded — 16 nodes, 25 edges, 16 telemetry rows, three
      operators. Re-run any time with `pnpm --filter @verimesh/agent seed` (idempotent: nodes upsert,
      edges are replaced) · done 14:05 · **A is unblocked**
- [ ] **B1** Simulator tick → `telemetry` + `nodes.metrics` writes on an interval; fault injection
      hook for scenarios · 60m · needs: B0 · unblocks: A2, C1

---

## Sat 13:30 → 17:00 · **B2 · THE SPIKE** (run this in parallel with B0/B1 — it is the biggest risk)

New toolchain, hard gate. **G2 is 17:00 and it is hard.** Do not blow through it debugging.

- [ ] **B2.0** Fund a deploy wallet on **Base Sepolia** (`84532`) from a faucet.
      · **C prepped this 15:20:** the wallet is generated and written to `.env.local`
      (`node --env-file=.env.local contracts/wallet.mjs`, idempotent — it reports the existing key
      rather than replacing it). **Address `0x8f071E986582D664E97DDACAE3F14b414322eB0b`, balance 0.**
      Faucet is the only human step left · **BLOCKED: needs a faucet drip** If it stalls, use
      **Arbitrum Sepolia** (`421614`) instead — identical code, take whichever funds first. Also
      confirm the exact Graph network slug (`base-sepolia` / `arbitrum-sepolia`) from the
      supported-networks page with **"Show Testnets"** toggled — a wrong slug fails at deploy · 15m
- [ ] **B2.1** Hardhat (or Foundry) project in `contracts/`; deploy `VerimeshRegistry` to
      **Base Sepolia** (⚠️ **not 0G Chain** — see BOARD correction #2); record `REGISTRY_ADDRESS`
      **and the deployment block number** in `.env.example` · 45m · needs: H0.2, B2.0
      · **C prepped this 15:20:** `contracts/deploy.mjs` — solc + ethers, no framework (Path A of the
      `base` skill). It compiles (verified), deploys, then **writes the ABI to `subgraph/abis/`,
      patches `subgraph.yaml` with the address *and* `startBlock`, and patches `.env.local`** — so
      the handoff C needs cannot be forgotten. One command:
      `node --env-file=.env.local contracts/deploy.mjs`
      · **BLOCKED: the deploy wallet has no balance**
- [ ] **B2.2** Script emits one `Committed` event; confirm the tx on Basescan · 15m · needs: B2.1
      · **C prepped this 15:20:** `contracts/seed-event.mjs` emits `Committed` **and** a
      `Frozen` + `resolveOverride` pair with two distinct nullifiers, so B2.4 can prove all four
      handlers index — not just one. `node --env-file=.env.local contracts/seed-event.mjs`
      · **BLOCKED: needs B2.1**
- [x] **B2.3** Subgraph: `subgraph.yaml` pointed at the deployed address + AssemblyScript mappings
      for all four events · 60m · needs: H0.3, B2.1 · **owner: C** (G1 rebalance) · **done 14:40**
      · all four handlers plus the three accumulators — `NodeHistory.incidentCount` feeds C's
      repeat-offender escalation and `HumanAuthority.overrideCount` feeds the per-human budget, so
      **B5.7's two queries already have entities to read**. ABI hand-written from the `.sol`;
      `graph codegen && graph build` both pass. Entity-key choices are documented in
      `subgraph/README.md` · **only `address`/`startBlock` are still placeholders — B2.1 fills them
      automatically**
- [ ] **B2.4** Create the subgraph in **Subgraph Studio**, `graph auth <DEPLOY_KEY>`,
      `graph codegen && graph build`, `graph deploy verimesh`. Query the dev URL in GraphiQL and get
      B2.2's seeded event back · 30m · needs: B2.3 · **owner: C** · ⚠️ **feeds G2 at 17:00**
      · ⚠️ **do not run `graph publish`** — publishing is mainnet-only and we do not need it
      · **C 15:20: everything that can be done without credentials is done.** `npm install` has run
      in `subgraph/`, `graph codegen` and `graph build` both pass, the WASM compiles.
      · **BLOCKED on two steps, in this order:** (1) **B runs B2.1** and publishes the address —
      decided 15:25, C does not deploy; (2) the **Studio deploy key** into `SUBGRAPH_DEPLOY_KEY`.
      Then it is `npx graph auth <key> && npx graph deploy verimesh`, ~10 minutes.
      · ⚠️ **Do not deploy the subgraph before the registry exists.** With `address: 0x000…0` it
      deploys happily and indexes nothing — which looks like a passing G2 and is not one.
      · **15:45 — step (2) is done.** Studio subgraph created, `graph auth` succeeded, `codegen` and
      `build` re-verified. **B2.4 is now one command (`npx graph deploy <slug>`) behind one input:
      your registry address.** Nothing else stands between us and the G2 gate.
- [ ] **B2.5** ⚠️ **G2 · 17:00 GO/NO-GO.** The subgraph ships either way — this is a *hosting*
      contingency, not a feature cut. If B2.4 is not green:
      1. local `graph-node` via docker-compose against the same RPC — same manifest, same mappings,
         only the host changes (needs docker + IPFS + Postgres, so pull images before starting)
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
      `AuthorizationRequirement` · 30m · needs: C3 · **C3 is done — `requireAuthorization(verdict,
      affectedOperators(verdict), action, authzConfig, { incidentCount, overrideCounts })`.
      `affectedOperators` comes from `@verimesh/verifier`; do not diff `projected` yourself, the
      blast radius is only meaningful against the do-nothing counterfactual, which the verifier
      already computed. `requirement.reason` is written to be shown verbatim in the freeze modal**
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
      · **the entities exist as of B2.3:** `nodeHistories(where: { nodeId: $nodeId }) { incidentCount }`
      and `humanAuthorities(where: { worldIdNullifier: $n }) { overrideCount }`. Feed them in as the
      `AuthzContext` — the policy is pure and will not fetch anything itself

---

## Sat 20:00 → Sun 02:00 · the loop

- [ ] **B6.1** Agent loop skeleton — `services/agent/src/index.ts` is a 1-line stub; wire
      telemetry → detect (deterministic rules, no LLM) · 60m · needs: B1
- [ ] **B6.2** `get_history(nodeId, operator)` against the subgraph, behind a single interface;
      feed the result into the diagnose context. Land it on **plain GraphQL** first so the loop is
      unblocked, then B7 swaps the transport underneath · 45m · needs: B2.6 · unblocks: B7
- [ ] **B6.3** Diagnose + propose — the **one** LLM decision, via B3, telemetry + history in context
      · 45m · needs: B3, B6.2
- [ ] **B6.4** `verify_constraints` call → C's verifier · 15m · needs: C1 · **C1 is done —
      `verifyConstraints(state, proposal)` from `@verimesh/verifier`. Pure, deterministic, does not
      mutate the state you hand it. Returns `VerdictResult` plus `violations`, `peak`, `baseline`
      and `blast`**
- [ ] **B6.5** `commit_state` — Supabase + 0G Storage blob + **registry `Committed` event** (Base
      Sepolia) carrying `authTier` **and the `zerogRoot` from the 0G Storage write**; store
      `chain_tx_hash`. The `zerogRoot` is what links the indexed row back to 0G — do not drop it
      · 60m · needs: B2.1, B4
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
      · **C2 is done — `SCENARIOS` / `scenarioById(id)` from `@verimesh/verifier` carry the fault
      patches, the proposal, the history context and the expected verdict/tier, so you can drive the
      loop from them instead of hand-injecting. `runAllScenarios()` runs the deterministic half.**
      ⚠️ the cascade's offline neighbour is **`node-11`**, not node-12 — see the correction in
      `STREAM-C.md`
- [ ] **B8.2** Retry/timeout on every network call (0G broker, RPC, subgraph). One flaky call must
      not kill the demo · 45m
- [ ] **B8.3** Seed a handful of historical decisions on-chain so `get_history` has real depth on
      stage · 20m
