# Verimesh — shared task board

**The single source of truth for who is doing what.** Everything here is derived from
[`docs/IMPLEMENTATION_PLAN_THEGRAPH.md`](../docs/IMPLEMENTATION_PLAN_THEGRAPH.md), cut down to the
time that actually remains. If the plan and this board disagree, **this board wins** — the plan is
the spec, this is the schedule.

---

## The clock

| | |
|---|---|
| **Hard deadline** | Sun **26 Jul, 09:00 WEST** (submission closed) |
| **Feature freeze** | Sun **06:00** — nothing new after this, only rehearsal |
| **Video + submission** | Sun 06:00 → 09:00 |
| **Board created** | Sat 25 Jul, 12:45 |

Plan hours (`H0`–`H34`) are **dead** — we started ~12h late. Everything below is on **wall-clock
Lisbon time**. The plan's `H` labels are kept only as cross-references to its sections.

---

## Skills — load these before writing sponsor code

Project skills live in `.claude/skills/` and are committed, so every teammate's Claude Code picks
them up on pull. They carry **API surface verified against live docs on 25 Jul**, plus the
Verimesh-specific wiring and the traps.

| Skill | Load it for |
|---|---|
| [`world-id`](../.claude/skills/world-id/SKILL.md) | IDKit 4.x, RP signing, nullifiers, the T0/T1/T2 gate, the quorum |
| [`zerog`](../.claude/skills/zerog/SKILL.md) | 0G Compute broker + attestation, 0G Storage blobs, 0G Chain/Galileo |
| [`subgraph`](../.claude/skills/subgraph/SKILL.md) | registry events, manifest, AssemblyScript mappings, graph-node, GraphQL, MCP |

**Two corrections these turned up — they change tasks already on this board:**

1. **World ID v4 killed `verifyCloudProof`.** The plan (§5, §9 B5) cites the v3 API. Verification
   is now `POST https://developer.world.org/api/v4/verify/{rp_id}`, the widget will not open
   without a backend-signed `rp_context`, and the field is `nullifier` (hex), not `nullifier_hash`.
   **Consequence:** `B5.1` now hard-blocks `A3.6.1` — there is no "render the widget first" path.
2. **Subgraph Studio will not accept 0G Chain.** Galileo is not on The Graph's supported-networks
   list. `B2.4`'s "Studio first" was backwards — **local `graph-node` via docker is the primary
   path.** Pull the docker images now, not at 16:45. *The subgraph itself is unaffected* — same
   graph-cli, same manifest, same mappings, same GraphQL. Only the host changes.
3. **The Graph's own Subgraph MCP server cannot query our subgraph.** `graphops/subgraph-mcp` hits
   the Graph Network gateway by subgraph ID and has no arbitrary-endpoint option, so plan §0's
   "query path = The Graph's Subgraph MCP server" is unreachable without publishing to the
   decentralized network. **`B7` becomes: write our own MCP server** over our GraphQL endpoint
   (`services/mcp` is already scaffolded for it, ~45m). Submission wording must say *custom MCP
   server*, not *The Graph's*.

Also: the 0G npm scope is **`@0gfoundation`**, not `@0glabs` as the plan's appendix says.

If a skill fights the SDK, re-read the live docs and **update the skill file** — do not work
around it silently and leave the next person to rediscover it.

---

## Protocol (read this before you touch the board — humans and AI agents)

1. **Before editing:** `git pull --rebase`
2. **Edit only your own stream file.** `STREAM-A.md`, `STREAM-B.md`, `STREAM-C.md`. Nobody edits
   another stream's file. This is how we avoid merge conflicts at 3am.
3. **The one shared surface** is the *Blockers* table in this file. Anyone may add a row. Keep
   additions at the bottom so diffs stay clean.
4. **After editing:** commit and push *immediately*. Do not batch.
   ```
   git add TASKS/ && git commit -m "tasks: <what changed>" && git push
   ```
5. **Load the relevant skill before writing sponsor code.** `world-id`, `zerog`, `subgraph`.
6. **Task line format** — keep it exactly this shape so agents can parse it:
   ```
   - [ ] **B2.1** Deploy registry to 0G Chain testnet · 45m · needs: H0.2 · unblocks: B2.3
   ```
   * claim it → append ` · **WIP @name HH:MM**`
   * finish it → flip to `- [x]` and replace the WIP tag with ` · done HH:MM`
   * stuck → append ` · **BLOCKED: <one line why>**` *and* add a row to the Blockers table
   * dropped → flip to `- [~]` and append ` · **CUT: <why>**`
7. **Do not restructure this board mid-event.** Add lines, flip boxes. Reorganising costs
   conflicts and buys nothing.
8. **AI agents:** you may flip your own owner's boxes and add sub-tasks under an existing task.
   You may not cut a task, change an estimate, or edit another stream's file without the human
   saying so.

---

## Owners — **FILL THIS IN FIRST**

| Stream | Scope | Owner |
|---|---|---|
| **A** | Frontend / 3D / GraphQL views / World ID widget | `@____` |
| **B** | Agent loop / 0G / registry / subgraph / World ID backend | `@____` |
| **C** | Verifier / authz policy / scenarios / property tests / acceptance | `@____` |

---

## Gates — the three moments that decide the outcome

| Gate | When | Test | If it fails |
|---|---|---|---|
| **G1 · Contract freeze** | Sat **13:30** | `pnpm typecheck` green with ✦ authz types; registry + `schema.graphql` match | Nobody starts real work until this passes. It blocks all three streams. |
| **G2 · THE GRAPH GO/NO-GO** | Sat **17:00** *(hard)* | A **local graph-node** indexes a real event from our registry and a GraphQL query returns it | Take the ladder in `STREAM-B.md` B2.5 **immediately** — move the registry to a Graph-supported chain. Do not keep debugging docker. |
| **G3 · End-to-end** | Sun **02:00** | `ambiguous_cascade` runs headless: detect → history → LLM → verify → freeze → World ID → commit → on-chain → indexed | Cut to the demo-only path: seed the history, hand-drive the scenario in the UI. |

---

## Blockers (shared — anyone may add a row)

| Time | Who | Blocked on | Needs |
|---|---|---|---|
| | | | |

---

## Scope — the full plan ships

**Nothing on this board is optional.** Every feature in
[`IMPLEMENTATION_PLAN_THEGRAPH.md`](../docs/IMPLEMENTATION_PLAN_THEGRAPH.md) is scoped and
scheduled below, including the ✦ stretch items (per-human budget, history-escalated tier) and the
MCP `get_history` tool. We are building all of it.

The plan's §10 emergency order is reproduced here **as a fire alarm only** — it is what you reach
for if a gate fails and a track is about to be lost, not a plan to shrink toward. If you find
yourself consulting it, raise it in the Blockers table first so the team decides together, not
alone at 4am.

> §10 order, if and only if forced: MCP wrapper → ✦ budget/escalation → `benign_spike` →
> 0G Storage blob → `recurring_fault` polish → (absolute last resort) T2 → T1.
>
> **Never, under any circumstance:** the deterministic verifier · one LLM decision via 0G Compute ·
> a live World ID scan · a subgraph indexing a real committed decision and answering a live
> GraphQL query on stage.

---

## Load balance — read this now, not at midnight

Rough estimates as scoped: **A ≈ 10h · B ≈ 16h · C ≈ 10h**, against an ~18h window.

Shipping the full plan is a scheduling problem, not a scope problem — but only if the load is
level. **B is over and B is on the critical path.** B owns the spike, the loop, both chains, and the
World ID backend; A and C both have slack B does not.

**Rebalance at G1 (13:30) — do both:**
- **B4 (0G Storage)** and **B5.1 (World ID API routes)** → **A**. Both are Next.js API routes
  living in A's app already.
- **B2.3 / B2.4 (subgraph mappings + deploy)** → **C** once the contract is frozen. It is schema
  work, which is C's lane, and it unblocks C's own acceptance harness.

That lands roughly **A ≈ 13h · B ≈ 12h · C ≈ 12h** — even, and every one of them fits the window
with sleep in it. Move the owner tags in the stream files when you agree the swap.

---

## Demo checklist (Sun 06:00 — rehearse, don't build)

- [ ] Scenario 1 runs clean: cascade → VIOLATION → freeze → **two distinct World ID scans** → commit
- [ ] Scenario 2 runs clean: `recurring_fault` → agent cites prior incident in the trace
- [ ] Live GraphQL query in the audit drawer, run on stage, returns real indexed decisions
- [ ] 0G Chain tx hashes open in the explorer
- [ ] Both World ID identities enrolled and tested on the actual demo machine
- [ ] Video recorded (physical freeze + memory beat + quorum moment)
- [ ] Submission: World + 0G + The Graph selected, subgraph endpoint + sample query + tx hashes
      pasted into the writeup
- [ ] `README.md` AI-attribution section reviewed by a human

---

## G1 · Contract freeze — the blocking shared task

All three of you, **right now**, together, ~45m. Nothing else starts until `pnpm typecheck` is green.

- [ ] **H0.1** `packages/shared/src/types.ts` — add ✦ `AuthTier`, `AuthorizationRequirement`,
      `HumanApproval`; add `authTier` + `approvals[]` to `DecisionRecord` (plan §6.1) · 15m · owner: C
- [ ] **H0.2** `contracts/VerimeshRegistry.sol` — replace the 3-event set with the ✦ set:
      `Committed`(+`authTier`), `Frozen`(+`requiredTier`,`requiredQuorum`), `HumanApproval`(per signer),
      `OverrideResolved`; `resolveOverride` **reverts on a duplicate nullifier** (plan §6.2) · 20m · owner: B
- [ ] **H0.3** `subgraph/schema.graphql` — add `authTier` to `Decision`; add `Approval`,
      `HumanAuthority`, `Operator`, `NodeHistory` (plan §6.3) · 15m · owner: B
- [ ] **H0.4** `packages/shared/src/authz_config.json` — `{ operators: { opA: [], opB: [] }, budgetPerWindow: N }`,
      nullifiers filled in after enrolment · 5m · owner: C
- [ ] **H0.5** `supabase/migrations/0002_authz.sql` — `commits.chain_tx_hash`,
      `human_gates.required_tier`, `human_gates.required_quorum`, `human_approvals` table · 15m · owner: B
- [ ] **H0.6** `authz.ts` **signature** agreed and stubbed (not implemented) — everyone codes against
      it from here · 10m · owner: C
- [ ] **H0.7** Fill in the Owners table above; everyone `.env` populated, `pnpm install`,
      `pnpm typecheck` green · 10m · owner: all
- [ ] **H0.8** Commit `docs/IMPLEMENTATION_PLAN_THEGRAPH.md` (currently modified locally — teammates
      can't see the ✦ revision) and push · 2m · owner: whoever holds the edit

---

## Stream files

- [`STREAM-A.md`](STREAM-A.md) — frontend / 3D
- [`STREAM-B.md`](STREAM-B.md) — backend / web3
- [`STREAM-C.md`](STREAM-C.md) — verifier / correctness
