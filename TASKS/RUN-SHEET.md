# Demo run sheet — C6.1

Owner: **C** · Run this **cold, twice**, on the **demo machine**, at Sun 04:00. Source checklist:
[`BOARD.md`](BOARD.md).

Read this the way a judge would: assume nothing works until you have watched it work. Every step
below has a **pass line** — a specific thing you must see with your own eyes. If you cannot see it,
the step failed, even if nothing errored. Silence is not a pass.

> **The one rule for 04:00:** do not fix anything during a run. Finish the run, write what broke in
> the Blockers table, then fix. A half-fixed stack mid-run is how you lose the second run too.

---

## 0 · Preflight (10 min, before you touch the demo)

| # | Do | Pass line |
|---|---|---|
| 0.1 | `git pull --rebase` | clean, no conflicts |
| 0.2 | `pnpm install` | no `ERR_PNPM_OUTDATED_LOCKFILE` |
| 0.3 | `pnpm typecheck` | exits 0, no output |
| 0.4 | `pnpm test` | all green |
| 0.5 | `pnpm acceptance` | **see §5 — this is the honesty gate** |
| 0.6 | Confirm `.env.local` has `SUBGRAPH_URL` starting `https://api.studio.thegraph.com/query/` | ⚠️ if it starts `https://thegraph.com/studio/` it is the **dashboard** URL — a POST returns HTML, `gql()` throws on parse and **silently falls back to fixtures**. The audit drawer will look perfect and be fake |
| 0.7 | Battery, charger, wifi, screen resolution, notifications off, browser zoom 100% | — |
| 0.8 | Phone(s) charged, World App installed and logged in, on the **same** network | — |
| 0.9 | Termux reporter running on the S22, host reachable from the phone | `device-s22` reads `Live · Galaxy S22`, not `No signal` |

**0.5 is not optional.** It is the only step that can tell you the demo is lying.

---

## 1 · Start the stack

Three long-lived terminals plus two one-shot commands. Run them in this order and wait for each
pass line before the next.

```
# 1 — reset the mesh to a known-good state (idempotent, safe to re-run)
pnpm --filter @verimesh/agent seed

# 2 — the UI
pnpm --filter @verimesh/web dev

# 3 — 🚨 REPAIR THE DEVICE NODE. The seed just deleted its edges. See the warning below.
curl -X POST http://localhost:3000/api/device/register -H "Authorization: Bearer <DEVICE_TOKEN>"

# 4 — the MCP server (agent memory over the subgraph)
pnpm --filter @verimesh/mcp start

# 5 — the agent loop
pnpm --filter @verimesh/agent start
```

> 🚨 **`seed` silently breaks the physical-device demo.** `services/agent/src/seed.ts` runs
> `.from("edges").delete().gte("id", 0)` and reinserts only the blueprint's 25 edges — which
> **deletes `device-s22`'s two links**, including the `device-s22 ↔ node-11` cross-operator edge
> that is the entire reason isolating the phone triggers a T2 quorum. Nothing errors. The phone
> still appears; it is just no longer wired into the mesh. **Every `seed` must be followed by
> `POST /api/device/register`** — it is idempotent, so running it is always safe. This is why the
> UI starts before the register call: the endpoint lives in the Next.js app.

| # | Pass line |
|---|---|
| 1.1 | seed prints `seeded 16 nodes, 25 edges` |
| 1.2 | <http://localhost:3000> renders the mesh |
| 1.3 | register returns `edgesAdded: 2` on a fresh seed (`0` if they were already there), and reports `crossOperator: [{node: "node-11", operator: "opB"}]` |
| 1.4 | the mesh shows **17 nodes** — the blueprint's 16 plus `device-s22` — and **27 edges** |
| 1.5 | MCP server is listening (default port 8787) and `GRAPH_MCP_ENDPOINT` points at it, or is unset so the loop falls back to plain GraphQL |
| 1.6 | the loop logs a tick without throwing; **no `insufficient funds`, no `nonce too low`** |
| 1.7 | the phone is reporting: `device-s22` shows **`Live · Galaxy S22`** within ~2s, not **`No signal`** |

**If the loop dies on a chain call:** it is designed to degrade to `chainTxHash: undefined` rather
than kill the decision. A missing tx hash is a visibly incomplete audit row; a thrown exception is a
dead demo. If it threw, that is a bug worth a Blockers row.

---

> 🚨 **AMENDMENT 01:00 (B) — §2 and §3 swap places. The live World beat is now §3, T1.**
> We have one World ID identity before submission, not two, so **§2 cannot complete** — its gate is
> T2 and needs two distinct nullifiers. The policy is not being relaxed to fit.
>
> **Run §3 first, as the scripted World moment.** It is a stronger beat than it was: the escalation
> to T1 is *caused by* The Graph — `node-09` really does return `incidentCount: 2` from the live
> subgraph (verified 01:00), and `REPEAT_OFFENDER_INCIDENTS` is 2, so the same safe action costs a
> human signature it did not cost the first time. One real scan, allowlist enforced, commits
> on-chain.
>
> **Then run §2 as a deliberate refusal, not a failure.** Inject the cascade, let it freeze at T2,
> scan once, and let the second slot stay empty. Say it out loud:
> *"it stopped, and it is still stopped, because the second human isn't in the room — it cannot
> talk itself past the requirement, and neither can we."* Then dismiss the modal and move on.
> §2's pass lines 2.6 through 2.11 below are **out of scope for this run** — keep 2.1–2.5.
> Leaving that gate open holds `node-07` in `awaiting_human`, which the detector skips, so the loop
> will not re-fire on it. That is intended, and it no longer strands the demo: the next injection
> cancels every open gate and releases every held node before it writes, and says in its output what
> it cleared.

## 1b · What an injection guarantees

Every `scenario` / `run-scenario` / **Simulate failure** injection now does the same four things
before it writes, and prints each one:

1. **Cancels every open gate and releases every held node** — a node stuck in `awaiting_human` from
   a previous run no longer silently swallows the next injection.
2. **Returns every other node to baseline**, so one scenario's leftovers cannot bleed into the next.
3. **Writes a physically self-consistent fault** — load, temperature, power, throughput and fan
   speed that the simulator's own physics could have produced, driven hard enough that the node
   settles *over* its ceiling. The fault holds instead of decaying, and the first observation the
   agent sees is not a lie.
4. **Checks the scenario's history precondition against the live subgraph**, and relocates the
   scenario onto a node whose indexed record fits if the declared one no longer does.

`pnpm --filter @verimesh/agent run-scenario <id>` adds a **`fault holds`** step that watches real
telemetry for two simulator ticks and fails if the fault decayed — the injection is not assumed to
have worked because it returned without erroring.

---

## 2 · Scenario 1 — the ambiguous cascade (the money moment)

```
pnpm --filter @verimesh/agent scenario ambiguous_cascade
```

This injects: `node-07` (opA) hot with falling throughput, `node-12` (opB) already loaded, and
`node-11` **offline**. *(The board text says node-12 offline; that is wrong and would make the beat
impossible — an offline node cannot be overloaded. See the correction in `STREAM-C.md`.)*

| # | Watch for | Pass line |
|---|---|---|
| 2.1 | the mesh | `node-07` goes amber, `node-11` reads offline |
| 2.2 | the trace panel | the agent **cites history** for `node-07` — this is the `get_history` call, and it must appear *before* the proposal |
| 2.3 | the proposal | `ISOLATE_NODE` on `node-07` |
| 2.4 | the verdict | **`VIOLATION_TRIGGERED`**, naming **`node-12`**, load ≈ **1.04 against a limit of 0.92** |
| 2.5 | the freeze | the mesh freezes; the modal says **T2**, quorum **2 of 2**, and names *why* — opA's fix breaches opB's node |
| 2.6 | **scan World ID — phone 1** | one slot fills; the other stays empty. **The gate must NOT resolve** |
| 2.7 | **scan World ID — phone 1 again** | ⚠️ **rejected.** "This human has already authorized this decision." **If it accepts, stop the demo — the whole World claim is dead** |
| 2.8 | **scan World ID — phone 2** | second slot fills, gate resolves |
| 2.9 | the commit | action applies, mesh recovers, `node-12` never exceeds its limits |
| 2.10 | Basescan | the decision tx opens and the `Committed` event decodes with the right field order |
| 2.11 | Basescan | **two `HumanApproval` events** with **two different** `worldIdNullifier` values, then `OverrideResolved` |

**2.7 and 2.11 are the demo.** Everything else is staging. If you only have time to rehearse two
things, rehearse those.

> ⚠️ **2.11 is the one most likely to fail silently.** `resolveOverride` is `B5.5`; until it is
> called, the commit lands with `authTier: 2` and **no `HumanApproval` events at all**. The UI will
> look completely correct. Check Basescan, not the screen.

---

## 3 · Scenario 2 — the agent remembers (the memory beat) · **run this FIRST — it is now the live World beat**

```
pnpm --filter @verimesh/agent scenario recurring_fault
```

Same fault signature as a benign spike, on `node-09` — a node the subgraph has seen before.

| # | Watch for | Pass line |
|---|---|---|
| 3.1 | the trace | the agent cites the **prior incidents on `node-09`**, with the real indexed count |
| 3.2 | the verdict | `VERIFIED` — the physics are fine, and that is the point |
| 3.3 | the tier | **T1, not T0.** The same safe action now costs a human signature *because history says repeat offender* |
| 3.4 | one scan | gate resolves |
| 3.5 | the commit | `resolveOverride` then `Committed` land — **one** `HumanApproval` event on Basescan, with the nullifier of the human who actually scanned, and `authTier: 1` |
| 3.6 | the audit drawer | that decision's authz ledger shows that one signer, enrolled to opA |

**3.5 is this run's 2.11.** It is the proof that a real human's World ID nullifier reached the chain
and gated a real commit. Check Basescan, not the screen.

**Say the line out loud while 3.3 is on screen:** *"identical physics, identical verdict — and it
costs a human this time, because the chain remembers."*

The injection checks this precondition against the live subgraph before it writes, and prints
`history: ok — node-09 has N indexed incidents…`. If `node-09` has fallen under
`REPEAT_OFFENDER_INCIDENTS`, the scenario **moves itself onto another opA node that has not**, says
so, and runs there — read the node id off the output rather than assuming `node-09`. If it prints
`history: NOT SATISFIED`, the beat cannot fire: no opA node has enough indexed history yet, and no
amount of re-running will change that.

---

## 4 · The audit drawer (run this live, on stage)

| # | Do | Pass line |
|---|---|---|
| 4.1 | click any decision → audit drawer | the **raw GraphQL query text is visible** — judges must see the query, not just the result |
| 4.2 | the result | real indexed row, matching what just happened |
| 4.3 | the links | registry tx opens on Basescan; the row's `zerogRoot` resolves in 0G Storage |
| 4.4 | the authz ledger | the distinct signers and the tier for that decision |

**Say:** *"any operator can run this exact query — there is no central API to trust."*

> ⚠️ 4.4 shows each human's **remaining override budget**. That number is read from the subgraph and
> **is not currently enforced anywhere** (`B5.7`). If a judge asks whether the limit is enforced,
> the honest answer today is "the count is on-chain and the policy is property-tested against it;
> wiring it into the gate is the last mile." Do not claim it blocks a fourth scan unless `B5.7`
> landed and `pnpm acceptance` shows `budget-truth` failing on a real over-budget human.

---

## 5 · The honesty gate

```
pnpm acceptance
```

Reads the registry's logs straight over RPC, then checks them against the deployed subgraph and
against `authz_config.json`. **This is the step that catches a demo that looked fine and wasn't.**

| Check | Green means |
|---|---|
| `C5.1 subgraph-truth` | every decision committed on-chain came back from GraphQL with matching fields — what the agent *remembers* is what actually happened |
| `C5.2 quorum-truth` | the chain recorded exactly the distinct nullifiers the policy demanded |
| `C5.2 authorization-trace` | nothing claims a human authorized it without `HumanApproval` events to prove it |
| `C5.2 allowlist-truth` | every on-chain signer was enrolled to the operator they signed for |
| `C5.2 budget-truth` | no human exceeded `budgetPerWindow` |

**Known-red at time of writing, both self-clearing:**
- `allowlist-truth` — RED until **`B5.6`** enrols the two nullifiers. While `authz_config` is empty,
  the verify route's `selfEnroll` fallback is **on**, and *any* verified human can authorize *any*
  gate. A judge scanning their own World ID will be waved through.
- `quorum-truth` — RED while the only resolved override on-chain came from `seed-event.mjs` and has
  no `human_gates` row.

**`authorization-trace` and `budget-truth` can be green for the wrong reason.** Both are vacuous
until B5.5 and B5.7 land — `authorization-trace` currently reports *0 human-authorized decisions*,
and `budget-truth` cannot fail because `overrideCounts` is always empty. Do not read those as
proof until the run has actually produced a human-authorized commit.

---

## 6 · Between the two runs — reset

```
pnpm --filter @verimesh/agent seed
curl -X POST http://localhost:3000/api/device/register -H "Authorization: Bearer <DEVICE_TOKEN>"
```

**Both lines, every time.** The second one is not optional — see the warning in §1.

Nodes upsert and edges are replaced, so the mesh returns to baseline. **The chain and the subgraph
do not reset** — that is correct and it is the point. The second run's history is genuinely deeper
than the first's, which makes `recurring_fault` *more* convincing the second time, and pushes
`benign_spike` onto a fresher node.

The agent loop can stay up across a reset. The simulator only writes a node it has not seen change
underneath it, so a reset or an injection wins the race rather than being stepped back over.

---

## 7 · Failure modes, and what to do instead of panicking

| Symptom | Actual cause | Move |
|---|---|---|
| **"Mesh unreachable"** or **"Event stream unreachable"** | **Supabase**, not the subgraph — `link === "error" && !hydrated` in `MeshViewport.tsx`. There is no "subgraph unreachable" state anywhere in the UI | Confirm the DB answers: `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/nodes?select=id&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"`. If that is 200, the page is holding a dead realtime socket — reload it. If the vars are missing from the browser bundle, restart the dev server (see next row) |
| A `NEXT_PUBLIC_*` change in `.env.local` has no effect | `next.config.mjs` reads the file **once at config load** and passes it through `env: publicEnv`, which Next inlines. A running dev server never picks up an edit | **Restart `pnpm --filter @verimesh/web dev`.** Anything added to `.env.local` mid-session — including `NEXT_PUBLIC_SUBGRAPH_URL` — is invisible until you do |
| Audit drawer shows plausible data that does not match what just happened | `SUBGRAPH_URL` is the dashboard URL, or the endpoint is down — `gql()` fell back to **fixtures** | Fix the env var. Do not demo the drawer until it is fixed; fixture data on stage is the worst outcome in this project |
| Freeze modal rejects a legitimate scan with `NOT_ON_ALLOWLIST` | `B5.6` enrolled the wrong nullifier form | Nullifiers are canonical lowercase `0x`, zero-padded to 32 bytes. Never compare raw strings |
| Any World ID scan is accepted, including strangers | `authz_config` allowlists are empty → `selfEnroll` is on | This is `B5.6`. Until fixed, **do not claim the allowlist is enforced** |
| Second scan by the same human is accepted | distinctness broken — policy, DB unique index and chain revert all bypassed | **Stop.** This is the differentiator. Nothing else is worth demoing |
| Tier is T0 when you expected T1 on `recurring_fault` | `incidentCount` came back 0 | The injection prints its `history:` line before it writes — read that. If it says NOT SATISFIED, no opA node has ≥ 2 indexed decisions and the beat is unavailable; check `SUBGRAPH_URL` first |
| `benign_spike` freezes at T1 instead of committing autonomously | its node has crossed `REPEAT_OFFENDER_INCIDENTS` — running the control case repeatedly is what does it | Nothing to do: the injection relocates to a node the chain has not seen and prints `moved off X onto Y`. If it cannot find one, every opA node is now a repeat offender |
| The agent proposes something the scenario is not written around | the proposer is probabilistic and is meant to be | `run-scenario` reports this as the `narrative` step and still grades the tier against the action actually proposed. Pass `--any-action` to accept it |
| Verdict is `ESCALATE` with *"cannot be verified — metrics no invariant applies to"* | a node id is not in `genio_blueprint.json`, or a metric arrived `null`/`NaN` from Supabase | Not a physics problem. Find the node named in the message |
| Loop stalls after two quick incidents | two concurrent commits from one wallet took the same nonce | the send queue in `packages/chain` serialises this; if it recurs, raise it |
| `graph auth` hangs forever | pinned graph-cli 0.80.x reads a lone argument as the node URL | `npx graph auth --studio <KEY>` |
| Phone shows in the mesh but isolating it never triggers a T2 | `seed` deleted its cross-operator edge to `node-11` | `POST /api/device/register`. Confirm the mesh has **27** edges, not 25 |
| Device ingest returns `404 unknown node` | same cause | same fix |
| `device-s22` reads **`No signal`** | reporter stopped, or `last_seen_at` older than `NEXT_PUBLIC_DEVICE_STALE_MS` (8s) | Restart the Termux reporter. This degrades gracefully by design — the demo survives it, so do not panic mid-run |

**Cut order if a track is about to be lost** (plan §10, fire alarm only — raise it in Blockers
first): MCP wrapper → budget/escalation → `benign_spike` → 0G Storage blob → `recurring_fault`
polish → (last resort) T2 → T1.

**Never cut:** the deterministic verifier · one LLM decision via 0G Compute · a live World ID scan ·
a subgraph answering a live GraphQL query on stage.

---

## 8 · Sign-off — copy this into the Blockers table after each run

```
Run 1  HH:MM  scenario 1 [pass/fail]  scenario 2 [pass/fail]  acceptance [n/14]  notes:
Run 2  HH:MM  scenario 1 [pass/fail]  scenario 2 [pass/fail]  acceptance [n/14]  notes:
```

A run only counts if it was **cold** — stack started from nothing, no warm-up attempt, no retry
after a fix. Two clean cold runs, or it is not rehearsed.
