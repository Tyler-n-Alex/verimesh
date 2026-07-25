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
| [`zerog`](../.claude/skills/zerog/SKILL.md) | 0G Compute broker + TEE attestation, 0G Storage blobs |
| [`subgraph`](../.claude/skills/subgraph/SKILL.md) | registry events, manifest, AssemblyScript mappings, Studio deploy, GraphQL, MCP |

**Three corrections these turned up — they change tasks already on this board:**

1. **World ID v4 killed `verifyCloudProof`.** The plan (§5, §9 B5) cites the v3 API. Verification
   is now `POST https://developer.world.org/api/v4/verify/{rp_id}`, the widget will not open
   without a backend-signed `rp_context`, and the field is `nullifier` (hex), not `nullifier_hash`.
   **Consequence:** `B5.1` now hard-blocks `A3.6.1` — there is no "render the widget first" path.
2. **🚨 DECIDED 25 Jul — the registry moves off 0G Chain to Base Sepolia.** Galileo is not on The
   Graph's supported-networks list, so Studio rejects it. Rather than self-host graph-node (docker +
   IPFS + Postgres, 1–3h, and a live dependency on the demo laptop), the registry deploys to
   **Base Sepolia (`84532`)** — or Arbitrum Sepolia (`421614`), whichever faucet funds first — and
   **Studio hosts the subgraph**. `graph deploy` is ~15 minutes and gives a hosted URL judges can
   hit themselves.
   **This does not weaken 0G.** 0G Compute (TEE-attested inference) + 0G Storage (audit blobs) are
   untouched and are the substantive 0G work; the registry only `emit`s. The `Committed` event still
   carries `zerogRoot`, so every indexed row points into 0G Storage.
   **Booth line for the seam:** *"the decision record is indexed where The Graph can serve it; the
   immutable payload lives on 0G, and every indexed row carries its 0G root."*
3. **The Graph's own Subgraph MCP server cannot query our subgraph — on any chain we can use.**
   `graphops/subgraph-mcp` hits the Graph Network gateway by subgraph ID and has no
   arbitrary-endpoint option. The gateway only serves subgraphs **published** to the decentralized
   network, and publishing is **mainnet-only** — a testnet subgraph can never be published. So
   `graph publish` is not attempted, and **`B7` becomes: write our own MCP server** over our GraphQL
   endpoint (`services/mcp` is already scaffolded for it, ~45m). Submission wording must say
   *custom MCP server*, not *The Graph's*.

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
   - [ ] **B2.1** Deploy registry to Base Sepolia · 45m · needs: H0.2 · unblocks: B2.3
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
| **G2 · THE GRAPH GO/NO-GO** | Sat **17:00** *(hard)* | A **Studio-hosted subgraph** indexes a real event from our Base Sepolia registry and a GraphQL query returns it | Fall back to local `graph-node` via docker against the same RPC (`STREAM-B.md` B2.5). Same manifest, same mappings — only the host changes. |
| **G3 · End-to-end** | Sun **02:00** | `ambiguous_cascade` runs headless: detect → history → LLM → verify → freeze → World ID → commit → on-chain → indexed | Cut to the demo-only path: seed the history, hand-drive the scenario in the UI. |

---

## Blockers (shared — anyone may add a row)

| Time | Who | Blocked on | Needs |
|---|---|---|---|
| | | | |
| 14:40 | C | **B2.4 subgraph deploy** — mappings, ABI and manifest are done and `graph codegen && graph build` both pass locally | `REGISTRY_ADDRESS` **and the deployment block number** from B2.1, plus a `SUBGRAPH_DEPLOY_KEY` from Studio. ~10 min of work once those exist. **This is the G2 17:00 gate** |
| 14:40 | C | **C5.1 / C5.2 acceptance harness** — written and unit-tested against a stub endpoint, cannot be run for real | `SUBGRAPH_URL` (B2.4), one committed decision (B6.5), one resolved override (B5.5) |
| 14:40 | C → A | `DECISION_AUDIT_QUERY` in `apps/web/src/lib/subgraph.ts` declares `$decisionId: Bytes!` but uses it for `decisions(where: { id: ... })`, and `Decision.id` is `ID!` in the frozen schema — the subgraph will reject that variable type the moment it is live | A: split it into `$decisionId: ID!` for the `decisions` filter and a separate `Bytes!` variable for `freezes`/`approvals`/`overrides`. Not urgent until `SUBGRAPH_URL` exists, but it will look like "the subgraph is broken" at 3am |

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
- [ ] Registry tx hashes open on Basescan, and each indexed row's `zerogRoot` resolves in 0G Storage
- [ ] Both World ID identities enrolled and tested on the actual demo machine
- [ ] Video recorded (physical freeze + memory beat + quorum moment)
- [ ] Submission: World + 0G + The Graph selected, subgraph endpoint + sample query + tx hashes
      pasted into the writeup
- [ ] `README.md` AI-attribution section reviewed by a human

---

## G1 · Contract freeze — the blocking shared task

**The code freeze is DONE and pushed (13:45).** What remains is environment setup, which each of
you does on your own machine.

- [x] **H0.1** `packages/shared/src/types.ts` — ✦ `AuthTier`, `AUTH_TIER_CODE`,
      `AuthorizationRequirement`, `HumanApproval`, `AuthzConfig`, `AuthzContext`; `DecisionRecord`
      now carries `authTier` + `approvals[]` (plan §6.1) · done 13:45
- [x] **H0.1b** `packages/shared/src/nullifier.ts` — **the canonical nullifier form**:
      lowercase `0x`, zero-padded to 32 bytes, decimal auto-converted. `normalizeNullifier`,
      `sameHuman`, `distinctNullifiers`, `hasDistinctQuorum`. **Everyone uses this — never compare
      raw nullifier strings.** Hex maps straight to the contract's `bytes32`, so there is no
      conversion at the chain boundary, which is where a mismatch would silently break T2 · done 13:45
- [x] **H0.2** `contracts/VerimeshRegistry.sol` — ✦ event set; `resolveOverride` takes the collected
      nullifiers + operators, **reverts `DuplicateNullifier`**, is idempotent
      (`OverrideAlreadyResolved`), emits one `HumanApproval` per signer then `OverrideResolved`
      (plan §6.2) · done 13:45
- [x] **H0.3** `subgraph/schema.graphql` — `Decision`(+`authTier`), `Freeze`, `Approval`, `Override`,
      `HumanAuthority`, `NodeHistory`, `Operator`; `subgraph.yaml` event signatures updated to match
      the new ABI (plan §6.3) · done 13:45
- [x] **H0.4** `packages/shared/src/authz_config.json` — **opA, opB *and opC*** (the blueprint has
      three operators, not two); `budgetPerWindow: 3`, `windowMs: 3600000`. Nullifier arrays are
      empty until enrolment (`B5.6`) · done 13:45
- [x] **H0.5** `supabase/migrations/0002_authz.sql` — `human_gates.required_tier/required_quorum/
      operators_required/reason/resolved_tx_hash`, `human_approvals` table with a **unique index on
      `(gate_id, nullifier)`**, `proposals.auth_tier`, `commits.auth_tier/human_authorized`.
      (`commits.chain_tx_hash` already existed in `0001`.) · done 13:45
- [x] **H0.6** `packages/shared/src/authz.ts` — signatures frozen and stubbed: `requireAuthorization`,
      `checkApproval` (returns a typed `ApprovalRejection`), `isSatisfied`. They throw until C
      implements them in `C3.*` · done 13:45
- [x] **B0a** `services/agent/src/seed.ts` + `pnpm --filter @verimesh/agent seed` — upserts the
      blueprint's 16 nodes, 25 edges and a first telemetry row · done 13:45 · **run it to unblock A**
- [x] **H0.9** Both migrations applied to Supabase (39 statements, 0 failures) and the mesh seeded
      — **16 nodes · 25 edges · opA 6 / opB 6 / opC 4 · the `node-07`→`node-12` cascade edge is
      live.** Realtime publication covers `nodes, events, proposals, verdicts, human_gates,
      human_approvals`. **A: the data is there, `A1` works now** · done 14:05
- [x] **H0.10** Two setup traps fixed — `.npmrc` (`manage-package-manager-versions=false`), because
      the `packageManager: pnpm@9.4.2` pin made `pnpm install` fail outright on pnpm 10; and the env
      file is now **`.env.local`** everywhere (Next.js loads it automatically, service scripts read
      it via `--env-file`). Do not create a second `.env` · done 14:05
- [ ] **H0.7** Fill in the Owners table above; everyone: copy `.env.example` → **`.env.local`**,
      `pnpm install`, `pnpm typecheck` green · 10m · owner: all
- [x] **H0.8** `docs/IMPLEMENTATION_PLAN_THEGRAPH.md` committed (`83a7685`) · done
      · ⚠️ it still describes the **0G Chain registry**, **`verifyCloudProof`** and **The Graph's
      Subgraph MCP server**. Corrections 1–3 at the top of this board supersede it. Read the board
      and the skills, not the plan, for those three things.

### Distinctness is now enforced in three places

A repeat nullifier is rejected by `authz.checkApproval` (app), by the unique index on
`human_approvals` (database), and by `revert DuplicateNullifier` (chain). Do not remove any of
them — the whole World differentiator is that "two different humans" cannot be faked, and a single
check is a single point of failure.

---

## Stream files

- [`STREAM-A.md`](STREAM-A.md) — frontend / 3D
- [`STREAM-B.md`](STREAM-B.md) — backend / web3
- [`STREAM-C.md`](STREAM-C.md) — verifier / correctness
