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
- [x] **B2.4** *(picked up)* Create the subgraph in **Subgraph Studio**, `graph auth <DEPLOY_KEY>`,
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

- [x] **C5.1** ◈ **Subgraph-truth check** — every decision committed on-chain appears in a
      `get_history` / GraphQL query with matching fields. What the agent *remembers* == what
      actually happened · 60m · needs: B6.5, B2.4 · **written and unit-tested against a stub endpoint
      14:40; cannot be RUN until B2.4 gives a `SUBGRAPH_URL` and B6.5 commits a decision**
      · **BLOCKED: no `SUBGRAPH_URL` — B2.1 has not deployed the registry, so B2.4 cannot deploy**
- [x] **C5.2** ✦ **Quorum-truth check** — the on-chain `HumanApproval` events for a resolved
      override contain **exactly** the distinct nullifiers the policy demanded. What the chain says
      was authorized == what the policy required · 45m · needs: B5.5, C5.1 · **written and unit-tested
      14:40; blocked on B5.5 for a real resolved override**
      · **BLOCKED: no resolved override exists on-chain yet (B5.5)**
- [x] **C5.3** Run the harness against both scenarios end-to-end and publish the result in the
      Blockers table if anything is red · 30m · needs: C5.2, B8.1 · runner shipped:
      `pnpm --filter @verimesh/verifier acceptance` · the **deterministic half runs green now**
      (5/5 scenario checks); the chain half prints `SKIPPED` until `SUBGRAPH_URL` is set and you pass
      `--input <committed.json>`
      · **BLOCKED: same as C5.1 — the chain half needs B2.4 + B6.5**

---

## Sun 04:00 → 06:00 · rehearsal support

- [ ] **C6.1** Be the one who runs the demo checklist in `BOARD.md` cold, twice, on the demo
      machine. You are the correctness lane — you are the right person to disbelieve it · 60m
      · **run sheet drafted 21:15 → [`RUN-SHEET.md`](RUN-SHEET.md).** Every step has a pass line, so
      a 04:00 run is mechanical rather than a judgement call. The run itself still needs the stack
      end-to-end, which is `B5.5`/`B5.6`
      · 🚨 **found while writing it: `pnpm seed` silently breaks the physical-device demo.** The seed
      deletes every edge and reinserts only the blueprint's 25, which removes `device-s22`'s
      cross-operator link to `node-11` — the edge that makes isolating the phone a T2. Nothing
      errors and the phone still renders. Every seed must be followed by
      `POST /api/device/register`. It was documented in `DEVICE-NODE.md` as a note for B; it now
      also sits in the run sheet as a required step, because at 04:00 nobody reads §📌
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

---

## Audit of the verifier — 16:30

Went at my own code with hostile input rather than the happy path. **Three fail-open defects, now
fixed and regression-tested** (73 tests). Fail-*open* is the wrong direction for a component whose
entire job is to refuse, so these mattered.

- **The verifier returned `VERIFIED` for a node it had never heard of.** `checkMetrics` returned
  `[]` for any id absent from `genio_blueprint.json`, and every comparison against `NaN` is false.
  A node at 999 °C with load 5 passed. So did a node whose `temp` arrived `null` from Supabase.
  Now: unverifiable nodes → `ESCALATE`, with every non-finite metric named.
  **B: if you ever see `cannot be verified — the projection contains metrics no invariant applies
  to`, that is a node id or a null column, not a physics problem.**
- **`"isolated"` was treated as a live node.** `NodeStatus` has both `isolated` and `offline`; only
  `offline` was excluded. An isolated node still absorbed shed load and still evolved in the
  simulator. With `node-11` marked `isolated` instead of `offline`, the cascade projected `node-12`
  at 0.953 instead of 1.037 — a materially *less* conservative number, off a status B could
  reasonably set. Both are now non-participating everywhere.
- **`isSatisfied` could be satisfied by humans on nobody's allowlist.** It never sees `config`, so
  it can only answer quorum + operator coverage. **Use `resolveGate(requirement, collected, config,
  context)`** — it re-vets the whole set through `checkApproval` first and returns
  `{ resolved, accepted, rejected }`. `isSatisfied` alone is not an authorization decision.

Smaller, same direction: `overrideCount` took the first matching key rather than the worst and
returned `0` for an unparseable nullifier; `quorumTruthCheck` threw on a malformed on-chain
nullifier instead of reporting red.

### Findings I did **not** change — they are spec, not code

- **The blueprint's own numbers are marginally inconsistent.** `L_max = 0.92` implies an
  equilibrium temperature of **85.07 °C** against `T_max = 85`. A node running at exactly its rated
  load exceeds its rated temperature, so **the temperature ceiling trips before the load ceiling
  ever does** (load binds only above ~0.916). Harmless for the demo — the cascade breaches both —
  but "load ceiling" does not mean what it looks like. Fixing it means editing `genio_blueprint.json`,
  which is frozen H0.1 data; raise `T_max` to 86 or drop `L_max` to 0.90 if anyone wants it exact.
- **Two of the four invariants do not bind in practice.** `power` needs ~4.5× the baseline draw and
  only `SCALE_UP` touches power at all (×1.1), so it is unreachable. `throughput` is a *dependent*
  symptom of temperature under `physics.ts` — it can only fire when the thermal ceiling has already
  fired, or when throughput is set inconsistently with the model. So the honest description is
  **two binding invariants (temp, load) plus a consistency backstop and a dead one**, not four
  independent constraints. The backstop still earns its place: it catches injected or sensor-faulted
  throughput that the thermal model does not explain.
- **`physics.ts` has no inter-node coupling at all** — each node's update depends only on its own
  metrics. The cascade is entirely the `t=0` load redistribution in `project.ts`. Do not say at the
  booth that the simulator propagates thermal cascades; say the verifier projects the redistribution
  an action would cause. It is a better claim anyway, and it is true.
- **T1 is nearly unreachable without the history escalation.** `ISOLATE_NODE` touches five nodes
  across two operators from any state in this blueprint, so it is always T2. That leaves
  `recurring_fault` as the only live T1 path — which is fine, it *is* the memory beat, but if
  anyone wants a T1 demo without history they will not find one by hand.
- **`nullifier.ts` (frozen, H0.1b): `"1234"` normalises as decimal → `0x4d2`, but `"01234"`
  normalises as hex → `0x1234`.** Same digits, different human, decided by a leading zero. World ID
  v4 returns `0x`-prefixed hex so this cannot bite us in practice, and the file is frozen — but a
  bare all-digit hex nullifier from any other source would silently become a different identity.
- **An isolated node's projected metrics freeze at the moment of isolation** (`node-07` shows 78 °C
  at 0 W forever). Physically it would cool. A already dims isolated nodes, so this is cosmetic —
  but do not put a temperature readout on an isolated node in the inspector.

---

## 17:05 — B2.4 deployed · **G2 is GREEN** · C5.1/C5.2/C5.3 green on live data

```
https://api.studio.thegraph.com/query/1756967/verimesh-base-sepolia/v0.0.1
```

**Publish that everywhere — it is `B2.6`, and it unblocks `A3.5`, `A5`, `B6.2` and `B7`.** It is
already in `.env.local` and `.env.example` as `SUBGRAPH_URL` and `NEXT_PUBLIC_SUBGRAPH_URL`.

Registry `0x0Fb557580E7C01Aed5D02622558216B9eb19c33c` · deploy block `44613204` · Base Sepolia.

**G2's actual test, run and passed:** a Studio-hosted subgraph indexes real events from our
registry and a live GraphQL query returns them. `hasIndexingErrors: false`. All four handlers fire —
5 `Decision`, 1 `Freeze` (requiredTier 2, requiredQuorum 2), 2 `Approval` with two **distinct**
nullifiers, 1 `Override` (`SCALE_UP`, 2 collected) — and the accumulators are live:
`nodeHistories` shows `node-07` and `node-09` at `incidentCount: 2`, which is exactly the input
`C3.3`'s repeat-offender escalation reads. **The memory beat is backed by real indexed data, not a
fixture.**

**The acceptance harness is green against the chain — 11/11.**

```
pnpm --filter @verimesh/verifier snapshot -- --from 44613204 --out ../../chain-snapshot.json
pnpm --filter @verimesh/verifier acceptance -- --input ../../chain-snapshot.json
```

The snapshot reads the registry's logs **straight over RPC with ethers**, never from the subgraph —
so C5.1 compares two independent sources. Building the input from the subgraph would have made the
check circular and it would have passed for free.

### Two things found while doing it

- 🪤 **`SUBGRAPH_URL` was set to the Studio *dashboard* URL** (`thegraph.com/studio/subgraph/...`),
  not the query API. A `POST` to it returns HTML, so `gql()` would have thrown a JSON parse error
  and **silently fallen back to fixtures** — the audit drawer would have looked like it was working
  while showing fabricated data on stage. The query endpoint is the one above, from the deploy
  output. Both are set correctly now.
- ⚠️ **`C5.2` cannot fully audit the per-operator requirement, and the contract is why.** `Frozen`
  emits `requiredTier` and `requiredQuorum` but **not `operatorsRequired`**, so from chain data
  alone there is no independent record of *which* operators the policy demanded. The check does
  verify, honestly and from the chain: the exact set of distinct nullifiers, that there are no
  duplicates, that the count meets the quorum, and that the resolved action matches. The
  "one distinct human **per required operator**" half is reconstructed from the approvals and is
  therefore not independently checked. **Do not claim it is.** If B feeds the harness from
  `human_gates.operators_required` (H0.5) instead of the chain snapshot, that half becomes real.

---

## 20:50 — audit of how the running system uses the verifier and the policy

The verifier and the policy are done and tested. **Whether the system actually calls them is a
different question, and the answer is partly no.** Four findings; the harness now catches all four
empirically rather than trusting that the wiring is right.

**Wired and working — checked, not assumed:**
- `verifyConstraints` + `affectedOperators` → `loop.ts:322,330` ✓
- `requireAuthorization` → `loop.ts:328` ✓
- **`incidentCount` comes from the subgraph for real** (`loop.ts:324` → `fetchAuthzContext`). I
  suspected this was stubbed; it is not. **The memory beat is genuinely live.**
- Duplicate-nullifier rejection: enforced in the verify route *and* by the DB unique index ✓

**Not wired:**
1. 🚨 **`resolveOverride` has no caller** outside `seed-event.mjs`, so a live T2 emits `Committed`
   with `authTier: 2` and **no `HumanApproval` events**. The quorum never reaches the chain.
2. 🚨 **The allowlist is bypassed right now** — `selfEnroll` is true whenever `authz_config` is
   empty, and it is empty. Any verified human can authorize any gate for any operator.
3. ⚠️ **`checkApproval` is never called** — the verify route reimplements it and **leaves out the
   budget check**. `C4.2` property-tests a function nothing runs.
4. ⚠️ **The budget is enforced nowhere** but *displayed* in `GraphPanel` from the subgraph. A limit
   shown and not enforced is worse than no limit.

**New acceptance checks (all in `C5.2`, all chain-vs-config so they are trustlessly auditable):**

| Check | Catches |
|---|---|
| `authorization-trace` | a decision claiming `humanAuthorized` with no `HumanApproval` indexed — finding 1 |
| `allowlist-truth` | an on-chain approval from a human not enrolled to that operator, **and** the "nobody is enrolled at all" case — findings 2 and 3 |
| `budget-truth` | any `humanAuthorities.overrideCount` above `budgetPerWindow` — finding 4 |

**Current state against the live chain: 12 of 14 green.** The two red are honest:
`allowlist-truth` (nobody enrolled — B5.6) and `quorum-truth` (the only resolved override on-chain
came from the seed script, so it has no `human_gates` row). Both go green on their own once B5.6 and
a real gate exist. **82 tests.**
