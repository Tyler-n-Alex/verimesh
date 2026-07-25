# Stream C — verifier / correctness

Owner: `@____` · Protocol + scope: [`BOARD.md`](BOARD.md) · Spec: plan §7, §9C, §1D
Skills: [`subgraph`](../.claude/skills/subgraph/SKILL.md) · [`world-id`](../.claude/skills/world-id/SKILL.md) — **load before B2.3/B2.4 and before `authz.ts`**

> ⚠️ **The registry is on Base Sepolia, not 0G Chain** (decided 25 Jul — The Graph does not support
> 0G Chain). Your B2.4 is a **Subgraph Studio deploy**, ~30 min, no docker. Set `network:` to the
> exact Graph slug and `startBlock` to the real deployment block. Read the `subgraph` skill first.

You own the two deterministic, safety-relevant artifacts — the **verifier** and **`authz.ts`** — plus
the acceptance harness that proves the whole thing is honest. You also picked up **B2.3/B2.4**
(subgraph mappings + deploy) in the G1 rebalance: it is schema work in your lane and it unblocks
your own subgraph-truth check.

`packages/verifier/src/index.ts` is a 1-line stub. Start there.

---

## Sat 13:30 → 16:30 · the verifier (plan §7)

- [x] **C0** `packages/shared/src/invariants.ts` — physical bounds only (temp ceiling, load ceiling,
      throughput floor, power envelope) read from `genio_blueprint.json` · 45m · needs: H0.1 · done 14:40 · every bound *derived* from the
      blueprint: `powerCeiling = c·(T_max−T_ambient)/b`, `throughputFloorRatio` = the throttle factor
      at `T_max`, so the floor and the thermal ceiling are the same physics, not two magic numbers
- [x] **C1.1** `verify_constraints(state, proposal) → VerdictResult` — deterministic **projection**
      of each action over `physics.ts`, then invariant check · 90m · needs: C0 · unblocks: B6.4 · done 14:40
      · projects **30 steps**, not one — a single tick cannot reach a thermal ceiling. Checks the whole
      trajectory against a **do-nothing counterfactual**, so a breach the action *causes* is
      `VIOLATION_TRIGGERED` and a breach it merely fails to fix is `ESCALATE`. Never `VERIFIED`
- [x] **C1.2** `projected` must carry the per-node post-action metrics — B's authz policy reads the
      **blast radius** out of it, and A renders it. Get this shape right first · 30m · needs: C1.1 · done 14:40
      · **B/A read this:** `projected[nodeId]` is the *final* projected state (real, renderable);
      `peak[nodeId]` is the worst-case envelope the invariant check uses; `blast: {nodes, operators}`
      is precomputed — call `affectedOperators(result)` from `@verimesh/verifier`, do not diff
      `projected` yourself, it needs the counterfactual to be meaningful
- [x] **C1.3** Unit tests: the ambiguous cascade returns `VIOLATION_TRIGGERED` on `node-12` when
      `node-07` is isolated · 30m · needs: C1.2 · done 14:40 · `pnpm test` — 55 tests green

---

## Sat 14:30 → 17:00 · subgraph (picked up at G1 — interleave with the verifier)

- [x] **B2.3** *(picked up)* AssemblyScript mappings for all four ✦ events → the entities in
      `schema.graphql`; `subgraph.yaml` pointed at B's deployed address · 60m · needs: H0.3, B2.1
      · done 14:40 · all four handlers + the three accumulator entities; hand-written ABI at
      `subgraph/abis/`; `graph codegen && graph build` both green (WASM compiles). **`address` and
      `startBlock` are still `0x000…`/`0` — B2.1 must fill both before deploy**
- [ ] **B2.4** *(picked up)* Create the subgraph in **Subgraph Studio**, `graph auth <DEPLOY_KEY>`,
      `graph codegen && graph build`, `graph deploy verimesh`. Query the dev URL in GraphiQL, get
      B2.2's seeded event back · 30m · needs: B2.3 · ⚠️ **feeds G2 at 17:00**
      · ⚠️ **do not run `graph publish`** — mainnet-only, and we do not need it
      · **BLOCKED: needs `REGISTRY_ADDRESS` + the deployment block from B2.1, and a
      `SUBGRAPH_DEPLOY_KEY` from Studio. Everything else is done — `graph codegen && graph build`
      already pass locally, so this is ~10 minutes once those two values exist**
      · **15:25 — asked and answered: B2.1 stays with B, C does not deploy the registry.** C prepped
      `contracts/{wallet,deploy,seed-event}.mjs` for B to run (see `STREAM-B.md`) and nothing was
      deployed. Studio key is coming from the human.
      · ⚠️ **Do not `graph deploy` before the registry address is real.** A subgraph pointed at
      `0x000…0` deploys cleanly and indexes nothing — a false green at G2, and you would then debug
      the mappings, which are fine.
      · **15:45 — `graph auth` is DONE.** Studio subgraph created by the human, deploy key in
      `.env.local`, `Deploy key set for https://api.studio.thegraph.com/deploy/`. `codegen` + `build`
      re-verified after auth. **The only command left is `npx graph deploy <slug>`**, and the only
      input left is B2.1's address.
      · 🪤 **`graph auth <KEY>` hangs forever on our pinned graph-cli 0.80.x** — a lone positional
      argument is read as the *node URL* and the CLI then blocks on an interactive prompt for the
      key, with no output. Use `npx graph auth --studio <KEY>`. Recorded in the `subgraph` skill and
      `subgraph/README.md`; the bare form in the skill was the >=0.9x syntax.

---

## Sat 17:00 → 19:00 · ✦ `authz.ts` — the differential-authorization policy (plan §1D)

- [x] **C3.1** Implement the tier function: `(verdict, projected, affectedOperators) →
      AuthorizationRequirement`. T0 autonomous · T1 single human on the operator's allowlist ·
      T2 two distinct humans when the projected effect crosses operators · 60m · needs: C1.2, H0.6
      · unblocks: B5.3 · done 14:40
- [x] **C3.2** Allowlist resolution against `authz_config.json` — operator → enrolled nullifier(s)
      · 20m · needs: C3.1 · done 14:40 · every comparison goes through `normalizeNullifier`, so a
      decimal-form nullifier and its hex form are the same human
- [x] **C3.3** ✦ Budget + repeat-offender escalation as **pure inputs** — the policy takes an
      incident count and a per-nullifier override count as arguments; B supplies them from the
      subgraph (B5.7). Keep the policy pure so it stays property-testable · 30m · needs: C3.2 · done 14:40
      · history escalation is capped at **T1** on purpose: letting a repeat offender push a
      single-operator action to T2 would demand two enrolled humans on one operator's allowlist and
      could deadlock the gate on stage

---

## Sat 19:00 → 22:00 · scenarios + property tests (plan §7, §9C)

- [x] **C2.1** `scenarios.ts` — `ambiguous_cascade`: rising temp + falling throughput on `node-07`
      (opA); its VIOLATION is what triggers the **T2 quorum** · 45m · needs: C1.3 · done 14:40
      · ⚠️ **spec correction:** this line (and plan §1 step 2) said *node-12 offline*, but C1.3 and
      plan §1 step 4 require node-12 to be the node that **breaches** — an offline node cannot be
      overloaded. The offline neighbour is **`node-11`** (opB); `node-12` (opB) is the victim, over
      the `node-07 → node-12` weight-0.6 cascade edge. Raise it if you disagree
- [x] **C2.2** ◈ `recurring_fault` — re-inject the same signature on `node-09` so `get_history`
      surfaces the prior incident and changes the decision. **This is the memory beat** · 45m · needs: C2.1
      · done 14:40 · identical physics, identical `VERIFIED` verdict, and the tier moves T0 → T1 on
      `incidentCount ≥ 2`. The variant `first_occurrence` runs the same fault with no history so the
      contrast can be shown live
- [x] **C2.3** `benign_spike` — verifies a simple `THROTTLE_NODE` · 20m · needs: C2.1 · done 14:40
- [x] **C4.1** `fast-check` property suite on the verifier — no action ever projects a state that
      breaches an invariant without returning `VIOLATION_TRIGGERED` · 60m · needs: C1.3 · done 14:40
      · stated as three properties over random states × random proposals: `VERIFIED` ⟹ every frame of
      the trajectory is clean · any breach ⟹ never `VERIFIED` · a breach the action introduces ⟹
      always `VIOLATION_TRIGGERED`. Plus determinism and no mutation of the caller's state
- [x] **C4.2** ✦ `fast-check` property suite on `authz.ts` over random verdict × blast radius ×
      approval sets: a cross-operator action **never** resolves on < 2 distinct nullifiers · a
      T1/T2 action **never** resolves on a nullifier off the affected operator's allowlist ·
      budget is **never** exceeded · 60m · needs: C3.3 · done 14:40 · seven properties, 500 runs each

---

## Sun 00:00 → 04:00 · acceptance harness (plan §9C — this is what makes the demo honest)

- [ ] **C5.1** ◈ **Subgraph-truth check** — every decision committed on-chain appears in a
      `get_history` / GraphQL query with matching fields. What the agent *remembers* == what
      actually happened · 60m · needs: B6.5, B2.4 · **written and unit-tested against a stub endpoint
      14:40; cannot be RUN until B2.4 gives a `SUBGRAPH_URL` and B6.5 commits a decision**
      · **BLOCKED: no `SUBGRAPH_URL` — B2.1 has not deployed the registry, so B2.4 cannot deploy**
- [ ] **C5.2** ✦ **Quorum-truth check** — the on-chain `HumanApproval` events for a resolved
      override contain **exactly** the distinct nullifiers the policy demanded. What the chain says
      was authorized == what the policy required · 45m · needs: B5.5, C5.1 · **written and unit-tested
      14:40; blocked on B5.5 for a real resolved override**
      · **BLOCKED: no resolved override exists on-chain yet (B5.5)**
- [ ] **C5.3** Run the harness against both scenarios end-to-end and publish the result in the
      Blockers table if anything is red · 30m · needs: C5.2, B8.1 · runner shipped:
      `pnpm --filter @verimesh/verifier acceptance` · the **deterministic half runs green now**
      (5/5 scenario checks); the chain half prints `SKIPPED` until `SUBGRAPH_URL` is set and you pass
      `--input <committed.json>`
      · **BLOCKED: same as C5.1 — the chain half needs B2.4 + B6.5**

---

## Sun 04:00 → 06:00 · rehearsal support

- [ ] **C6.1** Be the one who runs the demo checklist in `BOARD.md` cold, twice, on the demo
      machine. You are the correctness lane — you are the right person to disbelieve it · 60m
- [x] **C6.2** Write the two rehearsed booth lines from plan §1B into the submission draft: the
      "why does this need a blockchain" kill-shot and the memory line · 20m · done 14:40
      · `docs/SUBMISSION.md` — also carries the 0G/Base seam line and the *custom* MCP server wording

---

## What B and A can import right now (all of this is green)

```ts
import {
  verifyConstraints,
  affectedOperators,
  SCENARIOS,
  scenarioById,
  runAllScenarios,
  runAcceptance,
  createSubgraphFetch,
} from "@verimesh/verifier";
import { requireAuthorization, checkApproval, isSatisfied } from "@verimesh/shared";

const verdict = verifyConstraints(state, proposal);
const requirement = requireAuthorization(
  verdict,
  affectedOperators(verdict),
  proposal.proposed_action,
  authzConfig,
  { incidentCount, overrideCounts }
);
```

- **B6.4** — `verifyConstraints(state, proposal)` is pure, deterministic, and does not mutate the
  state you hand it. It returns a `VerdictResult` plus `violations`, `peak`, `baseline`, `blast`.
- **B5.3 / B5.7** — the policy is pure. `incidentCount` and `overrideCounts` are **arguments**;
  supply them from your plain GraphQL read, never fetch inside the policy.
- **B5.4** — collect approvals by calling `checkApproval` per scan and appending only the accepted
  ones, then gate resolution on `isSatisfied`. Do not compare nullifier strings yourself.
- **A3.6** — `requirement.reason` is written to be shown in the freeze modal verbatim; it already
  names the operators and the breach.
- Run `pnpm test` for the suites and `pnpm --filter @verimesh/verifier acceptance` for the harness.

### One thing that will look like a bug and is not

`packages/shared/src/authz_config.json` still has **empty nullifier arrays** (H0.4 — enrolment is
`B5.6`). Until the two demo identities are enrolled, `checkApproval` correctly rejects every scan
with `NOT_ON_ALLOWLIST` and no T1 or T2 gate can ever resolve. That is fail-closed and deliberate:
personhood is not authority. But if `B5.6` slips, the freeze modal will reject a real World ID scan
on stage and it will look like the World integration is broken. Enrol both identities early and run
`benign_spike` (T0, needs no human) to sanity-check the rest of the path independently.
