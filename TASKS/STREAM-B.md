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

> **B, 23:30 — first live end-to-end reasoning cycle, and two real bugs it surfaced.** Injected a
> real fault (`node-07` hot, `node-11` offline) to test World ID against a genuine gate, and hit
> two bugs in code that had never actually been exercised end-to-end before:
>
> 1. **`packages/sim`'s `persistState` upsert omitted `name`/`operator_id`** — both `NOT NULL` with
>    no default. Postgres validates the implicit insert tuple before conflict resolution, so this
>    silently failed the *entire batch upsert, for every node*, on every single simulator tick,
>    since B1 first landed. Fixed by including `name`/`operator_id` in the upsert payload.
> 2. **`gridFingerprint` hashed the whole mesh**, including `device-s22`. That device reports on
>    its own ~8s cadence (D's real phone). A real 0G Compute call takes 50-90s. So the device's
>    *own heartbeat alone* guaranteed every reasoning cycle would discard as `STALE`, regardless of
>    which node was actually being reasoned about — **this would have silently broken the loop the
>    moment the physical device landed**, not just in my test. Scoped the fingerprint to the
>    reasoning node + its direct neighbors (`relevantNodeIds` in `db.ts`).
>
> With both fixed, a real cycle completed — 0G proposed `THROTTLE_NODE` for `node-07` using real
> history (cited two prior verified decisions) — and the verifier escalated:
> `THROTTLE_NODE cannot be verified — the projection contains metrics no invariant applies to:
> device-s22 has no bounds in genio_blueprint.json`. **That's a blueprint/verifier gap, not B's** —
> `device-s22` was added to the mesh without physical bounds in `genio_blueprint.json`, so *any*
> action that projects onto it will always escalate. Flagged in `BOARD.md`'s Blockers table for C/D
> to pick up. The escalation did open a real T1 gate and the World ID widget rendered a genuine QR
> end-to-end (B5.1/B5.2 confirmed live) — it just needs an actual phone scan to complete, which I
> can't fabricate.

> **B, 00:30 — the freeze branch is wired end to end, and four things were silently broken.**
> Everything below was found by reading the live DB (`nodes`, `human_gates`, `human_approvals`,
> `verdicts`) rather than by reasoning about the code, and each one would have failed on stage.
>
> 1. **The gate could never resolve.** `/api/worldid/verify` sets `human_gates.status` to
>    `authorized`; `pollGateSatisfaction` only ever queried `pending` and `processResolvedGates`
>    only `resolved`. So the moment the final scan landed the gate left every query the agent
>    makes and **the commit never happened** — no `resolveOverride`, no `Committed`, no tx. The UI
>    would have shown both slots filled and then simply stopped. `pollGateSatisfaction` now polls
>    `pending` **and** `authorized`.
> 2. **The verify route hand-rolled the policy and assigned `operator: "unenrolled"`.** With the
>    allowlist empty, `eligible` and `enrolledFor` are both empty, so every signer was recorded as
>    `unenrolled` — and `coversRequiredOperators(["opA"], [unenrolled])` is `false`, so even the
>    quorum arithmetic could not have passed. There is a real row in the DB proving it: gate 10,
>    one approval, operator `unenrolled`, still `pending`. The route now calls C's `checkApproval`
>    and, while self-enrolment is on, assigns the first unfilled **required** operator.
> 3. **Every live verdict was `ESCALATE`.** Three consecutive proposals on `node-07` in the DB, all
>    `THROTTLE_NODE cannot be verified — device-s22 has no bounds in genio_blueprint.json`.
>    `device-s22` (+ its two edges) is now in the blueprint, so the verifier can project it —
>    see the note under B8.1.
> 4. **The loop re-gated a node it had already frozen.** `detectAnomaly` skipped `offline` and
>    `isolated` but not `awaiting_human`, so it re-proposed every 8s while a human was deciding —
>    gates 8, 9 and 10 are the same incident three times, with three `Frozen` txs. Now skipped.
>
> ⚠️ **Those three stale `pending` gates are still in the DB.** The freeze modal opens on the newest
> pending gate, so the UI will pop one on load until they are closed. They cannot resolve (operator
> `unenrolled`), so close them before rehearsing:
> `update human_gates set status = 'cancelled' where status = 'pending';`

Order below is the order to do it in. B2 starts early and runs in parallel with everything.

---

## Sat 13:30 → 15:00 · make the loop have something to loop over

- [x] **B0** Migrations applied + mesh seeded — 16 nodes, 25 edges, 16 telemetry rows, three
      operators. Re-run any time with `pnpm --filter @verimesh/agent seed` (idempotent: nodes upsert,
      edges are replaced) · done 14:05 · **A is unblocked**
- [x] **B1** Simulator tick → `telemetry` + `nodes.metrics` writes on an interval; fault injection
      hook for scenarios · 60m · needs: B0 · unblocks: A2, C1 · done 16:37 · `packages/sim` ticks
      on `AGENT_MODE=sim|full`; `setFaults`/`clearFaults`/`parseFaultEnv` give scenarios a hook

---

## Sat 13:30 → 17:00 · **B2 · THE SPIKE** (run this in parallel with B0/B1 — it is the biggest risk)

New toolchain, hard gate. **G2 is 17:00 and it is hard.** Do not blow through it debugging.

- [x] **B2.0** Fund a deploy wallet on **Base Sepolia** (`84532`) from a faucet.
      **Address `0x8f071E986582D664E97DDACAE3F14b414322eB0b`.** · done 16:44 · funded 0.09 ETH via
      faucet drip · 15m
- [x] **B2.1** Hardhat (or Foundry) project in `contracts/`; deploy `VerimeshRegistry` to
      **Base Sepolia** (⚠️ **not 0G Chain** — see BOARD correction #2); record `REGISTRY_ADDRESS`
      **and the deployment block number** in `.env.example` · 45m · needs: H0.2, B2.0 · done 16:45
      · `node --env-file=.env.local contracts/deploy.mjs` ·
      **`REGISTRY_ADDRESS=0x0Fb557580E7C01Aed5D02622558216B9eb19c33c`, deploy block `44613204`**,
      tx <https://sepolia.basescan.org/tx/0x7aff2708dfdff965ca76bbbfe1b69e0c1669414abb5eed68d050a35f50df6f92>.
      Recorded in `.env.example`; `subgraph.yaml` and `.env.local` patched automatically by the script.
- [x] **B2.2** Script emits one `Committed` event; confirm the tx on Basescan · 15m · needs: B2.1
      · done 16:46 · `node --env-file=.env.local contracts/seed-event.mjs` ·
      Committed <https://sepolia.basescan.org/tx/0x996e2a123b671dd2959d837c632f99eb4dae9b455340e71c83b3735b3b9f8614>,
      Frozen <https://sepolia.basescan.org/tx/0xa3d460a867fae16bd4e254b7605f93986103f70f4fb673f594b0b614943efc50>,
      Resolved <https://sepolia.basescan.org/tx/0x521e35264beb21d99430b03a862f5a43f47d0b17210c70e4895dd8e4f0d0250c>
      · **B2.4 is now unblocked — the registry has a real address and all four event types are on-chain**
- [x] **B2.3** Subgraph: `subgraph.yaml` pointed at the deployed address + AssemblyScript mappings
      for all four events · 60m · needs: H0.3, B2.1 · **owner: C** (G1 rebalance) · **done 14:40**
      · all four handlers plus the three accumulators — `NodeHistory.incidentCount` feeds C's
      repeat-offender escalation and `HumanAuthority.overrideCount` feeds the per-human budget, so
      **B5.7's two queries already have entities to read**. ABI hand-written from the `.sol`;
      `graph codegen && graph build` both pass. Entity-key choices are documented in
      `subgraph/README.md` · **only `address`/`startBlock` are still placeholders — B2.1 fills them
      automatically**
- [x] **B2.4** Create the subgraph in **Subgraph Studio**, `graph auth <DEPLOY_KEY>`,
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
      `build` re-verified. · **DONE 17:05 — G2 PASSED.** Slug `verimesh-base-sepolia`, version
      `v0.0.1`. Query endpoint (this is `B2.6`, publish it):
      `https://api.studio.thegraph.com/query/1756967/verimesh-base-sepolia/v0.0.1`
      All four handlers index; `hasIndexingErrors: false`. **B6.2 and B7.1 are unblocked.**
      ⚠️ `SUBGRAPH_URL` had been set to the Studio *dashboard* URL — a POST there returns HTML and
      A's `gql()` would have silently fallen back to fixtures. Fixed in `.env.local`/`.env.example`.
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

- [x] **B3** 0G Compute — broker setup, one attested inference call, `zerog_inference_valid` written
      to `proposals`; provider fallback (OpenAI/Anthropic) behind the same interface · 90m · unblocks: B6
      · done 20:19 · dedicated wallet `0x5aE14EBec183F8A18d55fc51ed88Ed593E0AbBDB` funded to 10.5 OG,
      `broker.ledger.depositFund(3)` + `transferFund` to provider
      `0xa48f01287233509FD694a22Bf840225062E67836` (`chatbot`, `qwen2.5-omni-7b`, TEE `dstack`)
      succeeded. Ran a real inference through `proposeAction` — schema-valid proposal back,
      `zerogInferenceValid: true`. `ZEROG_COMPUTE_PROVIDER` set in `.env.local`. `proposals.
      zerog_inference_valid` column already existed and `loop.ts` already wrote to it
- [x] **B4** 0G Storage — write the full reasoning blob, store `zerog_root` · 45m · needs: B3
      · **owner: A** (G1 rebalance) · done 20:19 — verified working off the same wallet: uploaded a
      test blob via `uploadBlob`, got back a real root hash and tx hash on the storage node network.
      Uploads pay gas directly rather than through the Compute ledger, so this didn't need B3's
      3 OG minimum. Leaving the `[x]` for A to confirm against their own integration, since it's
      still their task per the rebalance — just noting the code path is confirmed functional

---

## Sat 18:00 → 22:00 · World ID (plan §9 B5 + §1D)

- [x] **B5.1** `/api/worldid/sign` (RP context via `signRequest`) + `/api/worldid/verify`
      (POST `developer.world.org/api/v4/verify/{rp_id}`) · 45m · **owner: A** (G1 rebalance — it
      lives in A's Next.js app) · ⚠️ **the plan's `verifyCloudProof` is the v3 API and is gone —
      see the `world-id` skill.** The widget cannot open without a backend-signed `rp_context`, so
      **this blocks A3.6.1** · unblocks: A3.6.1 · done 21:06 · all four env vars now set
      (`NEXT_PUBLIC_WORLDID_APP_ID`, `WORLDID_RP_ID`, `WORLDID_SIGNING_KEY`, `WORLDID_ACTION`).
      Hit `/api/worldid/sign` for real against a running dev server: `200`, `configured: true`,
      full valid `rp_context` (signature/nonce/timestamps) back. The widget can now actually open.
      `/api/worldid/verify` (A's route) already has the full B5.2–B5.5 logic built — allowlist
      check, duplicate-nullifier rejection, distinct-quorum satisfaction, per-gate operator
      coverage — reviewed the code, did not exercise it, since that needs a real IDKit proof from
      an actual scan (phone or the World ID Simulator), which is a human step I can't substitute for
- [x] **B5.2** Valid proof → record a `HumanApproval` (nullifier + enrolled operator) against the
      open `human_gate` · 45m · needs: B5.1, H0.5 · done 00:30 · the row is written by
      `/api/worldid/verify` **after** C's `checkApproval` accepts it, not before — the canonical
      nullifier, the operator the signer is entitled to, and the chosen action
- [x] **B5.3** Wire C's `authz.ts` into the freeze branch: verdict + projected blast radius →
      `AuthorizationRequirement` · 30m · needs: C3 · done 00:30 · `runCycle` calls
      `requireAuthorization(verdict, affectedOperators(verdict), action, authzConfig, ctx)` and
      **persists the requirement onto the gate row**; `pollGateSatisfaction` now reads it back with
      `gateRequirement(gate)` instead of re-deriving it from a fabricated verdict, which is what it
      used to do — that old call passed `verdict: "VIOLATION_TRIGGERED"` and a hardcoded
      `ISOLATE_NODE` and then overwrote all three fields anyway
- [ ] **B5.4** **T1 end-to-end** — single human, allowlist checked, gate resolves, commit proceeds
      · 45m · needs: B5.2, B5.3 · **code path complete and green headless** —
      `pnpm --filter @verimesh/agent run-scenario recurring_fault --auto-approve` walks
      detect → propose → verify → freeze → approve → resolve → `resolveOverride` → `Committed`.
      **Left unticked deliberately: I have not watched a real World ID scan drive it.** One live
      scan on `recurring_fault` closes this
> **C, 21:00 — a definition of done for `B5.5`/`B5.6`/`B5.7`, so nobody has to take it on faith.**
> One command, from the repo root:
>
> ```
> pnpm acceptance
> ```
>
> It reads the registry's logs straight over RPC, then checks them against the deployed subgraph and
> against `authz_config.json`. **Three of its checks are exactly these three tasks**, and all three
> are RED or vacuous today:
>
> | Check | Goes green when |
> |---|---|
> | `C5.2 authorization-trace` | `B5.5` actually calls `resolveOverride` — today it reports *0 human-authorized decisions*, because nothing has ever emitted a `HumanApproval` outside `seed-event.mjs` |
> | `C5.2 allowlist-truth` | `B5.6` enrols the two nullifiers — today it is RED with *"authz_config has no enrolled nullifiers at all"*, which also means the verify route's `selfEnroll` fallback is currently letting **any** verified human authorize **any** gate |
> | `C5.2 budget-truth` | `B5.7` enforces the budget. It cannot fail today: `fetchAuthzContext` is called with `nullifiers: []`, so `overrideCounts` is always empty and nothing is ever over budget. `GraphPanel` still *shows* each human's remaining budget |
>
> Nothing here is new scope — it is these three tasks not being finished yet. **I have deliberately
> not touched `loop.ts` or `worldid/verify/route.ts`**; they are yours and you are in them.
> Two notes that will save time when you get there:
> - `resolveOverride` must use the **same** id string you already pass to `freezeNode` —
>   `` `proposal-${proposalId}` `` — so the `Freeze`, `Approval` and `Override` rows join to the
>   `Decision`. The subgraph and the audit drawer both key off that.
> - Prefer `resolveGate(requirement, collected, config, context)` over `isSatisfied` in
>   `processResolvedGates`. `isSatisfied` answers quorum and operator coverage only; it cannot see
>   the config, so on its own it will resolve a gate on humans who are on nobody's allowlist. That
>   is a real hole, not a style point — there is a regression test for it in `audit.test.ts`.

- [ ] **B5.5** **T2 quorum** — gate stays open until it holds the required *distinct* nullifiers,
      one per affected operator; **reject a repeat nullifier**; emit `HumanApproval` per accepted
      signer + `OverrideResolved` on resolution · 90m · needs: B5.4 · **protect this — it is the World edge**
      · **code complete 00:30, needs two real scans to tick.** The gate now stays open until
      `resolveGate` accepts it, and **only the approvals the policy accepted reach the chain** —
      `processResolvedGates` passes `resolution.accepted`, not every row, so a rejected signer can
      never appear in a `HumanApproval` event. Distinctness is refused in four places now: the
      policy, the unique index, `revert DuplicateNullifier`, and the freeze modal's slot map
      · headless proof: `run-scenario ambiguous_cascade --auto-approve` (two simulated signers)
- [ ] **B5.6** Enrol both World ID identities (2 phones, or 1 phone + the **World ID Simulator**)
      into `authz_config.json`, one per operator · 20m · **do this early, not at 4am** · unblocks: B5.5
      · **the tooling is done 00:30, the two nullifiers are not** — I cannot fabricate them:
      ```
      pnpm --filter @verimesh/agent enrol --list
      pnpm --filter @verimesh/agent enrol opA 0x…      # phone 1
      pnpm --filter @verimesh/agent enrol opB 0x…      # phone 2 / the World ID Simulator
      ```
      Get each nullifier by scanning **with no gate open**: `POST /api/worldid/verify` with only
      `{ idkitResponse }` returns the canonical form and records nothing. The CLI normalises,
      refuses a malformed value, warns if one human is enrolled to two operators (they could then
      fill a T2 on their own), and prints that the self-enrolment bypass switches off the moment
      the arrays are non-empty. **Restart `next dev` afterwards** — the JSON is imported at load
- [x] **B5.7** ✦ Subgraph-fed policy inputs (plan §9 B5 stretch, §1D) — before opening a gate, query
      the subgraph over **plain GraphQL** (not the agent's MCP tool — the one-LLM-decision invariant
      must hold) for: (a) the node's incident count → escalate the tier for a repeat offender,
      (b) each signer's recent override count → enforce `budgetPerWindow` · 60m · needs: B5.5, B2.6, C3
      · done 00:30 · (a) was already live in `runCycle`. (b) is now real in both places it matters:
      **`/api/worldid/verify` queries `humanAuthorities(worldIdNullifier_in: [$n]) { overrideCount }`
      for the scanning human and passes it to `checkApproval`, so a signer over budget is refused at
      the moment of the scan** with `BUDGET_EXCEEDED`; and the agent passes the collected nullifiers
      into `fetchAuthzContext` before `resolveGate`, so an over-budget signature cannot resolve a
      gate either. The response carries `overrideCount`, `budgetPerWindow` and `budgetSource`
      · ⚠️ **if the subgraph is unreachable the budget fails open** (`budgetSource: "unavailable"`)
      — refusing a legitimate human because a query timed out is the worse failure on stage, but it
      does mean the honest claim is "enforced against the indexed count", not "unconditionally"

---

## Sat 20:00 → Sun 02:00 · the loop

- [x] **B6.1** Agent loop skeleton — `services/agent/src/index.ts` is a 1-line stub; wire
      telemetry → detect (deterministic rules, no LLM) · 60m · needs: B1 · done 19:57 ·
      `services/agent/src/detect.ts` + `loop.ts`'s `runCycle` — no-op short-circuits before any LLM call
- [x] **B6.2** `get_history(nodeId, operator)` against the subgraph, behind a single interface;
      feed the result into the diagnose context. Land it on **plain GraphQL** first so the loop is
      unblocked, then B7 swaps the transport underneath · 45m · needs: B2.6 · unblocks: B7 · done 19:57
      · `loop.ts`'s `fetchHistory` — plain GraphQL by default, `HISTORY_VIA_MCP=1` swaps the transport
      · **re-verified 21:11 against the real deployed subgraph** (C's B2.4) — `getHistory("node-09",
      "opA")` returns both seeded incidents with `incidentCount: 2`. Caught a stale local
      `.env.local`: mine still had the old Studio *dashboard* URL C's note warned about
      (`https://thegraph.com/studio/subgraph/...` — returns HTML, silently falls back to fixtures);
      fixed to the real query endpoint from `.env.example` and added the new `REGISTRY_START_BLOCK`/
      `NEXT_PUBLIC_REGISTRY_ADDRESS` vars. **Worth every teammate double-checking their own
      `.env.local` against `.env.example` after pulling B2.4**, since that file isn't tracked
- [x] **B6.3** Diagnose + propose — the **one** LLM decision, via B3, telemetry + history in context
      · 45m · needs: B3, B6.2 · done 20:19 · B3 unblocked — `loop.ts` calls `proposeAction`, which now
      runs real 0G attested inference with `zerogInferenceValid: true` instead of the heuristic fallback
- [x] **B6.4** `verify_constraints` call → C's verifier · 15m · needs: C1 · **C1 is done —
      `verifyConstraints(state, proposal)` from `@verimesh/verifier`. Pure, deterministic, does not
      mutate the state you hand it. Returns `VerdictResult` plus `violations`, `peak`, `baseline`
      and `blast`** · done 19:57 · called directly in `loop.ts`'s `runCycle`
- [x] **B6.5** `commit_state` — Supabase + 0G Storage blob + **registry `Committed` event** (Base
      Sepolia) carrying `authTier` **and the `zerogRoot` from the 0G Storage write**; store
      `chain_tx_hash`. The `zerogRoot` is what links the indexed row back to 0G — do not drop it
      · 60m · needs: B2.1, B4 · done 20:19 · `loop.ts`'s `finalizeCommit` — Supabase write, registry
      commit (B2.1 deployed) and 0G Storage upload (root hash confirmed live) all funded and working
- [x] **B6.6** Freeze branch — VIOLATION / low confidence → authz policy → collect quorum →
      re-verify → commit · 60m · needs: B5.5, B6.5 · code done in `loop.ts`'s `openHumanGate` +
      `pollGateSatisfaction` + `processResolvedGates` · **done 00:30 — the branch now actually
      closes.** The three fixes that were missing: the `authorized` status is polled, the
      requirement is read from the gate row instead of re-derived, and `resolveGate` (not
      `isSatisfied`) decides — so a signer who is on nobody's allowlist cannot release a gate, which
      is the hole C flagged. `processResolvedGates` re-checks before committing and **puts a gate
      back to `pending` with a `reject` event if the policy refuses it**, rather than committing on
      a stale resolution. A node in `awaiting_human` is no longer re-detected, so one incident opens
      exactly one gate
- [x] **B7.1** Write a **Verimesh MCP server** in `services/mcp` (currently a 1-line stub) exposing
      `get_history` over our subgraph's GraphQL endpoint · 45m · needs: B2.6
      · ⚠️ **The Graph's own `subgraph-mcp` cannot reach our subgraph** — it queries the Graph
      Network gateway by subgraph ID only, with no arbitrary-endpoint option. Plan §0's "query via
      The Graph's Subgraph MCP server" is not achievable; ours is. See the `subgraph` skill.
      · done 19:57 · `services/mcp/src/index.ts` — `POST /get_history`, `GET /health`
- [x] **B7.2** Point B6.2's interface at the MCP tool so the agent's step 3 goes through MCP
      · 30m · needs: B7.1, B6.2 · done 19:57 · `HISTORY_VIA_MCP=1` routes `loop.ts`'s `fetchHistory`
      through the MCP server instead of direct GraphQL
- [x] **B7.3** Write the submission line **accurately**: "a custom MCP server exposing our subgraph
      as agent-queryable memory" — **not** "we used The Graph's Subgraph MCP server." Judges check
      · 5m · needs: B7.2 · done 20:23 · already correct in `docs/SUBMISSION.md`'s "Wording we must
      get exactly right" section (C wrote it); filled in the registry address, seed decision tx
      hashes and a verified 0G Storage root in that doc's "To paste before submitting" list

---

## Sun 02:00 → 06:00 · harden

- [x] **B8.1** Headless scenario runner — `ambiguous_cascade` and `recurring_fault` run start to
      finish with no human at the keyboard except the World ID scans · 60m · needs: C2, B6.6
      · **C2 is done — `SCENARIOS` / `scenarioById(id)` from `@verimesh/verifier` carry the fault
      patches, the proposal, the history context and the expected verdict/tier, so you can drive the
      loop from them instead of hand-injecting. `runAllScenarios()` runs the deterministic half.**
      ⚠️ the cascade's offline neighbour is **`node-11`**, not node-12 — see the correction in
      `STREAM-C.md`
      · done 00:30 · `pnpm --filter @verimesh/agent run-scenario <id> [--auto-approve] [--timeout 300]`
      · it injects, then waits on the **real** loop and prints a PASS/FAIL line per stage — stack,
      inject, detect+propose, verify, freeze, authorize, commit, on-chain, 0G storage — with the
      Basescan URL and the `zerogRoot`, and exits non-zero on the first red. Without
      `--auto-approve` it blocks on genuine scans and tells you how many are outstanding; with it,
      it fills the slots from simulated signers (refused unless `ALLOW_SIMULATED_APPROVALS=true`,
      and every such approval is written into `events` as **SIMULATED … not a World ID scan** so it
      can never be mistaken for the real thing on a replay)
      · **Two things had to be fixed before this could ever have worked:**
      1. **The scenario faults could not trigger the detector.** `detectAnomaly` required
         `temp > 85`; the cascade injects `node-07` at **78 °C**, and at load 0.88 / 210 W the
         thermal model settles at **82.9 °C** — it can never reach 85, so the loop would have sat
         idle through the whole scenario. `pnpm scenario` also called `setFaults`, which is
         module state **in its own process** and never reached the running simulator.
      2. **`temp > 85` is `T_max`, so anything it could detect was already breaching** — that
         violation lands in the do-nothing baseline too, which makes it `preExisting`, which makes
         every verdict `ESCALATE`. `VERIFIED` was unreachable on a live cycle, so `benign_spike`'s
         T0 beat and `recurring_fault`'s "VERIFIED but T1 because history" beat were both dead.
      Detection is now: past the **warn** line **and** the blueprint's own thermal equilibrium sits
      over the ceiling — deterministic, no LLM, and it fires *before* the breach. Injection drives
      the node's power so that equilibrium really is above the ceiling (`node-07` → 301 W, settles
      at 89 °C, starts at 78 °C), so the fault **holds across simulator ticks instead of decaying**.
      Verified offline against all three scenarios — detect fires, and verdict / violating node /
      blast radius / tier / quorum come out exactly as C's `expect` block says:
      cascade `VIOLATION_TRIGGERED` on `node-12`, opA+opB, **T2 q2** · recurring `VERIFIED`, opA,
      **T1 q1** · benign `VERIFIED`, opA, **T0 q0**
      · ⚠️ **`device-s22` had to be added to `genio_blueprint.json`** (with its two edges) for any of
      this to verify — see the blocker note. Its bounds there are rig-like on purpose: they are what
      the *verifier* projects against. The phone's real thresholds (`T_max 40`, `L_max 0.28`) stay in
      `classifyDevice`, where its status comes from, and are unchanged. The simulator now skips
      `kind = 'device'` rows so it cannot overwrite the phone's own telemetry, and `seed` carries the
      device + its edges, so **`pnpm seed` no longer deletes the cross-operator link** — the trap at
      the top of the run sheet is gone (`POST /api/device/register` is still correct, just no longer
      load-bearing)
- [x] **B8.2** Retry/timeout on every network call (0G broker, RPC, subgraph). One flaky call must
      not kill the demo · 45m · done 19:57 · `packages/chain/src/retry.ts`'s `withRetry`/`withTimeout`
      cover the 0G broker (`llm.ts`), 0G Storage (`storage.ts`) and subgraph GraphQL (`subgraph.ts`)
      calls, plus the agent's MCP `get_history` fetch. **Registry chain calls
      (`commitDecision`/`freezeNode`/`resolveOverride`) get a timeout only, not a resubmitting
      retry** — the contract has no dedup on `id` for those two, so blindly retrying risks emitting a
      duplicate `Committed`/`Frozen` event if a retry fires after the first tx actually landed but we
      just failed to observe it. `resolveOverride` alone is idempotent on-chain but was kept
      consistent with the other two for simplicity.
- [x] **B8.3** Seed a handful of historical decisions on-chain so `get_history` has real depth on
      stage · 20m · done 19:57 · `contracts/seed-history.mjs` — two prior `node-09`/opA incidents
      (matches `recurring_fault`'s premise that the mesh has already seen this signature twice),
      one `node-07` SCALE_UP, one `node-02` THROTTLE_NODE for general depth
