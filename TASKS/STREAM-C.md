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

- [ ] **C0** `packages/shared/src/invariants.ts` — physical bounds only (temp ceiling, load ceiling,
      throughput floor, power envelope) read from `genio_blueprint.json` · 45m · needs: H0.1
- [ ] **C1.1** `verify_constraints(state, proposal) → VerdictResult` — deterministic **projection**
      of each action over `physics.ts`, then invariant check · 90m · needs: C0 · unblocks: B6.4
- [ ] **C1.2** `projected` must carry the per-node post-action metrics — B's authz policy reads the
      **blast radius** out of it, and A renders it. Get this shape right first · 30m · needs: C1.1
- [ ] **C1.3** Unit tests: the ambiguous cascade returns `VIOLATION_TRIGGERED` on `node-12` when
      `node-07` is isolated · 30m · needs: C1.2

---

## Sat 14:30 → 17:00 · subgraph (picked up at G1 — interleave with the verifier)

- [ ] **B2.3** *(picked up)* AssemblyScript mappings for all four ✦ events → the entities in
      `schema.graphql`; `subgraph.yaml` pointed at B's deployed address · 60m · needs: H0.3, B2.1
- [ ] **B2.4** *(picked up)* Create the subgraph in **Subgraph Studio**, `graph auth <DEPLOY_KEY>`,
      `graph codegen && graph build`, `graph deploy verimesh`. Query the dev URL in GraphiQL, get
      B2.2's seeded event back · 30m · needs: B2.3 · ⚠️ **feeds G2 at 17:00**
      · ⚠️ **do not run `graph publish`** — mainnet-only, and we do not need it

---

## Sat 17:00 → 19:00 · ✦ `authz.ts` — the differential-authorization policy (plan §1D)

- [ ] **C3.1** Implement the tier function: `(verdict, projected, affectedOperators) →
      AuthorizationRequirement`. T0 autonomous · T1 single human on the operator's allowlist ·
      T2 two distinct humans when the projected effect crosses operators · 60m · needs: C1.2, H0.6
      · unblocks: B5.3
- [ ] **C3.2** Allowlist resolution against `authz_config.json` — operator → enrolled nullifier(s)
      · 20m · needs: C3.1
- [ ] **C3.3** ✦ Budget + repeat-offender escalation as **pure inputs** — the policy takes an
      incident count and a per-nullifier override count as arguments; B supplies them from the
      subgraph (B5.7). Keep the policy pure so it stays property-testable · 30m · needs: C3.2

---

## Sat 19:00 → 22:00 · scenarios + property tests (plan §7, §9C)

- [ ] **C2.1** `scenarios.ts` — `ambiguous_cascade`: rising temp + falling throughput on `node-07`
      (opA), `node-12` (opB) offline; its VIOLATION is what triggers the **T2 quorum** · 45m · needs: C1.3
- [ ] **C2.2** ◈ `recurring_fault` — re-inject the same signature on `node-09` so `get_history`
      surfaces the prior incident and changes the decision. **This is the memory beat** · 45m · needs: C2.1
- [ ] **C2.3** `benign_spike` — verifies a simple `THROTTLE_NODE` · 20m · needs: C2.1
- [ ] **C4.1** `fast-check` property suite on the verifier — no action ever projects a state that
      breaches an invariant without returning `VIOLATION_TRIGGERED` · 60m · needs: C1.3
- [ ] **C4.2** ✦ `fast-check` property suite on `authz.ts` over random verdict × blast radius ×
      approval sets: a cross-operator action **never** resolves on < 2 distinct nullifiers · a
      T1/T2 action **never** resolves on a nullifier off the affected operator's allowlist ·
      budget is **never** exceeded · 60m · needs: C3.3

---

## Sun 00:00 → 04:00 · acceptance harness (plan §9C — this is what makes the demo honest)

- [ ] **C5.1** ◈ **Subgraph-truth check** — every decision committed on-chain appears in a
      `get_history` / GraphQL query with matching fields. What the agent *remembers* == what
      actually happened · 60m · needs: B6.5, B2.4
- [ ] **C5.2** ✦ **Quorum-truth check** — the on-chain `HumanApproval` events for a resolved
      override contain **exactly** the distinct nullifiers the policy demanded. What the chain says
      was authorized == what the policy required · 45m · needs: B5.5, C5.1
- [ ] **C5.3** Run the harness against both scenarios end-to-end and publish the result in the
      Blockers table if anything is red · 30m · needs: C5.2, B8.1

---

## Sun 04:00 → 06:00 · rehearsal support

- [ ] **C6.1** Be the one who runs the demo checklist in `BOARD.md` cold, twice, on the demo
      machine. You are the correctness lane — you are the right person to disbelieve it · 60m
- [ ] **C6.2** Write the two rehearsed booth lines from plan §1B into the submission draft: the
      "why does this need a blockchain" kill-shot and the memory line · 20m
