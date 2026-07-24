# Verimesh — Implementation Plan · **Variant B (Hedera Agentic Payments)**

> **This is the Hedera variant.** It's a fork of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (the Sui version) — same World + 0G anchors, same 3‑person structure, but the **third chain is Hedera** and Verimesh gains an **economic layer**: the agent's fixes also settle real payments between nodes, and those settlements are verified + human‑gated by the same machinery. Read the Sui plan's §4 (Collaboration Protocol) and §7 (simulation/verifier) first — they're 95% identical; this file marks only what changes. **⟐ = differs from the Sui plan.**

> **Event:** ETHGlobal Lisbon 2026 · **Hard deadline:** Sun **July 26, 09:00 WEST**.
> **Track:** Classic "Start Fresh" — all code during the event, incremental commits.
> **Partner prizes (max 3):** **World**, **0G**, **⟐ Hedera** (AI & Agentic Payments — the bigger pool).
> **Judging:** Technicality · Originality · Practicality · Usability (UI/UX/DX) · WOW Factor.

---

## 0. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| Team | **A = FE/3D**, **B = Backend/web3**, **C = Verifier/formal + correctness** | 3 folder‑disjoint lanes + the physics/economics seam. |
| Effort | A & B all‑in ~35–40h; **C toolkit TBD** (self‑calibrates §4.6 of Sui plan) | B is verifier backstop. |
| ⟐ Third chain | **Hedera — AI & Agentic Payments** (HTS + Hedera Agent Kit) | **No Move risk** (EVM/HTS). But **adds a payments subsystem** — split across A+B+C so B isn't buried. |
| ⟐ On‑chain role | Hedera holds the **economic consequence** (settlements), not node state | Supabase = operational state · 0G = audit · **Hedera = money**. Three distinct roles, no overlap. |
| 0G depth | **0G Compute for inference from the start** | Attested inference folded into the 0G audit log; fallback adapter. |
| Data layer | **Supabase** operational/realtime; **0G Storage** immutable audit | Balances live in Supabase (realtime UI); settlements are real Hedera txs referenced by id. |
| World surface | **Web app + IDKit cloud verify** | AgentKit "human‑backed agent" narrative; ⟐ now the human authorizes **physical + financial** consequences. |
| Aesthetic | **Dark, clean enterprise SaaS, no neon**, 3D grid hero, tasteful motion | HeroUI v3 dark. |
| 3D fidelity | **Stylized instanced grid + FX** | Instanced nodes, animated links, subtle bloom. |

**⟐ Scope discipline (critical):** the LLM still makes **exactly one** decision — *pick one action from the fixed menu*. The **settlement is a deterministic consequence of that action** (rule‑based, in `packages/economics`), **not** a second LLM decision. This keeps the "one real decision" scope, and it's what makes the economic verifier meaningful (a deterministic thing to check). Do **not** let the agent "optimize the economy."

**Non‑goals (unchanged):** grid‑wide optimization, multi‑decision agents, real hardware, mobile, auth/multi‑tenant, prod RLS, >1 LLM decision.

---

## 1. North Star & the demo beat

**⟐ One sentence:** *An autonomous agent watches a 3D mesh of infra nodes that are also economic actors; the LLM proposes fixes, a deterministic verifier simulates each fix against a structural blueprint **and its economic policy**, only actions that are **both physically safe and financially valid** run, any rejected/high‑privilege action freezes the system until a World‑ID‑verified human signs off — and every executed fix settles a real payment between nodes on **Hedera**, with the whole reasoning + verdict written immutably to **0G**.*

**⟐ The demo beat (two scenarios now — one physical, one economic):**

*Scenario 1 — the ambiguous cascade (physical safety):*
1. Live 3D mesh, healthy; balances ticking; trace calm.
2. Inject on `node‑07`: rising temp + falling throughput + neighbor `node‑12` offline. Rules can't classify.
3. LLM diagnoses → proposes `ISOLATE_NODE(node‑07)`.
4. Verifier simulates: isolating 07 overloads a neighbor past thermal limit → **PHYSICAL VIOLATION** → freeze.
5. **World ID scan** → authorize → `SCALE_UP` then `ISOLATE`.
6. Re‑verify → VERIFIED → commit: **⟐ SCALE_UP provisions paid capacity → a real Hedera HTS settlement fires** (treasury → node), inter‑node load transfer settles node→node; balances update live; 0G audit written; mesh recovers.

*Scenario 2 — the budget breach (economic safety — proves payments are load‑bearing):*
7. Anomaly on `node‑04`; LLM proposes `REBALANCE_LOAD` (physically fine).
8. Verifier checks economics: the settlement would drive `node‑04` below its budget floor → **ECONOMIC VIOLATION** → freeze.
9. **World ID scan** → human authorizes a treasury top‑up (or the safe alternative) → VERIFIED → settle on Hedera.
10. Click any decision → audit drawer: diagnosis + 0G‑Compute attestation + **Hedera settlement tx (HashScan link)** + the economic check that fired.

**⟐ Why this wins the payments track:** payments aren't decorative — an action can be *rejected on purely economic grounds*, and the human is authorizing a real financial movement. That's the "why not a for‑loop" bar, applied to money.

---

## 1B. Product thesis & positioning (say this at the booth)

Sponsor judges reward projects with a *real chance to become a real product* — and their "why does this need a blockchain?" test is the **same** question. There's exactly one framing that passes both: **DePIN.** Pitch it as a generic "AI + guardrails" tool and you lose the crypto rationale; pitch it as the trust‑and‑settlement layer for decentralized infra and every integration becomes necessary. ⟐ The payments angle makes this product story **stronger** than a state‑only chain — trustless settlement between independent operators is a concrete DePIN need, not a bolt‑on.

**What it is (one line):** *Verimesh is the safety + coordination layer that lets an AI autonomously manage a **decentralized** physical‑infrastructure network without anyone having to trust it — the AI proposes, a deterministic verifier disposes (physics **and** economics), a World‑ID human breaks ties, and every decision + **payment between operators** settles trustlessly on‑chain.*

**Who it's for (name it — never say "critical infra"):** operators of DePIN compute/sensor networks (io.net, Akash, Render, Helium‑style) where **independently‑owned** nodes must be kept healthy, coordinated, **and paid** by parties who don't trust each other.

**Why the crypto is load‑bearing (the whole point is trustlessness between untrusting operators):**
- **World ID** — proves a *real, unique human* (not a rival's bot or another agent) authorized a privileged override.
- **0G** — a tamper‑proof audit trail + verifiable inference that *no single operator can forge*.
- **⟐ Hedera** — nodes settle **real payments** for work exchanged, verified + human‑gated. Independent operators *must* be paid for verified work without trusting a central clearinghouse — the core DePIN economic primitive.

**Sim → real is one adapter (say this out loud):** `get_telemetry_data()` is a clean boundary — swap the simulator for a Prometheus / IoT / cloud‑metrics feed and the identical agent + verifier + human‑gate + settlement stack runs on live infrastructure. Simulated **hardware**, not simulated **architecture**.

**The "why does this need a blockchain?" kill‑shot (rehearse verbatim):** *"Because the operators are independent and don't trust each other or the AI. A centralized log can be edited; a centralized override faked; a centralized clearinghouse can withhold payment. We need an audit no operator can forge, an authorization a bot can't spoof, and settlements no middleman controls. Remove the chain and a multi‑party DePIN network can't safely hand control **or its money** to an AI at all."*

**What we're NOT (avoid the trap):** not a generic "AI + guardrails" wrapper (that wouldn't need a chain), not a grid optimizer, not a second LLM deciding payments (settlement is a deterministic, verified consequence of the one action). One narrow, safe, *trustless* decision loop for multi‑party infra.

---

## 1C. Making the build *show* the thesis (cheap DePIN reinforcements)

**Verdict on restructuring: don't.** The architecture already fits — a rebuild would burn hours you don't have. The gap is that the *demo* shows an anonymous grid while the *pitch* claims a multi‑operator trustless network. Close it with a thin **"DePIN skin"** — metadata + framing, not new systems. **Scope guardrail: do NOT build tokenomics, staking, or slashing beyond the settlement layer already scoped — *show* DePIN, don't over‑build an economy.**

| # | Change | Where it lands | Cost | Payoff |
|---|---|---|---|---|
| 1 | **`operator` dimension** — each node belongs to one of 2–3 independent operators. **Bake into the H0 frozen contract:** `nodes.operator_id` + `GridNode.operator`. | §6 schema/types (H0) | ~20 min | **Keystone.** Turns "a grid" into "a multi‑party network." Everything below depends on it. |
| 2 | **Operator‑aware 3D + UI** — color‑group / badge nodes by operator; small operator legend. | A / §8 | ~30 min | Judges *see* independent owners at a glance. |
| 3 | **Cross‑operator freeze** — flag actions that impact a *different* operator's nodes as a human‑gate trigger (alongside VIOLATION); the modal names both operators. | detector/verifier + freeze modal | ~45 min | Makes the human gate *necessary because of multi‑party structure*. |
| 4 | **Audit drawer → "proof / dispute" view** — same 0G root + Hedera tx + attestation, framed from an operator's POV: "Operator B can independently verify what the AI did and was paid — tamper‑proof." | A / §8 audit drawer | ~15 min (copy) | Makes *trustlessness felt*, not just claimed. |
| 5 | **⟐ Cross‑operator settlements** — settlements flow between *different operators'* nodes (Operator A pays Operator B for absorbing load); settlement feed shows operator→operator. | economics + settlement feed | free once #1 exists | The DePIN economic primitive, literally on screen. |
| 6 | **DePIN‑native telemetry labels** — GPU util, jobs/sec, uptime‑SLA, power (same physics, DePIN naming/units). | blueprint + sim + inspector | ~30 min | Reads as a real compute network. |
| 7 | **Visibly swappable telemetry source** — simulator implements a `TelemetrySource` interface with a `// swap for PrometheusSource / IoTSource` stub. *(Stretch: wire ONE real metric so you can say "this node is live.")* | `packages/sim` | ~20 min stub / ~1h real | Makes "one adapter from real" credible. |

**Demo beat, reframed to two operators (no new work):** assign `node‑07 → Operator A`, `node‑12 → Operator B`. The ambiguous anomaly becomes a *cross‑operator conflict* — the fix for A's node would harm B's node, and the recovery involves **A paying B** for absorbing load. Neither party trusts the other or the AI, so you need a neutral World‑ID human, an un‑forgeable audit, and a settlement no middleman controls. Same beat, DePIN meaning. The `budget_breach` scenario likewise becomes "Operator A's node can't afford the settlement" — a *cross‑operator solvency* problem.

---

## 2. Architecture at a glance

The system is **three tiers plus the chains**, with data flowing top-to-bottom and back up (⟐ = differs from the Sui plan):

| Tier | What runs there | Owner | How it connects |
|---|---|---|---|
| **Frontend** — Next.js + R3F | 3D mesh (hero), reasoning trace, event log, node inspector, action menu, **⟐ balances panel + settlement feed**, freeze modal, World ID widget | **A** | Subscribes to Supabase (realtime, read-only); calls B's `/api/worldid/*`. **No chain code.** |
| **Supabase** — Postgres + Realtime *(the seam)* | `nodes`, `edges`, `telemetry`, `events`, `proposals`, `verdicts`, `commits`, `human_gates`, **⟐ `balances`, `settlements`** | **shared contract** | **B writes** (service key); **A subscribes** (anon). |
| **Agent service** — Node loop | the 5-step loop below; imports the verifier | **B** (verifier authored by **C**) | Reads the simulator; writes Supabase + the chains. |
| **Chains** | **0G Compute** (attested inference) · **0G Storage** (audit trail) · **⟐ Hedera** (HTS settlement / Agent Kit) | **B** | Called by the agent service on each decision. |

**The agent loop (Stream B), step by step:**

1. `get_telemetry_data()` — pull the latest simulator window.
2. **detect anomaly** — deterministic rules (no LLM).
3. **diagnose + propose** — the *one* LLM decision, via **0G Compute**.
4. `verify_constraints()` — **C's** projection checking **physical + ⟐ economic** invariants → `VERIFIED` / `VIOLATION` / `ESCALATE`.
5. `commit_state()` — on **VERIFIED**: state → Supabase, audit → 0G, **⟐ settlement → Hedera**. On **VIOLATION / low confidence** (physical *or* ⟐ economic) → **freeze** → **World ID** sign-off → re-verify → commit.

**End-to-end flow (one line):** Simulator → Supabase → [ detect → LLM propose → verify (physical + ⟐ economic) → commit + ⟐ settle ] → Supabase → Frontend 3D.

**Freeze branch:** verifier `VIOLATION` → `human_gates` (pending) → **World ID** → operator picks the safe action → re-verify → commit.

**⟐ Role separation stays crisp:** Supabase = hot operational state (incl. live balances) · 0G Storage = immutable reasoning audit · **Hedera = the settled economic consequence.** No two systems do the same job.

---

## 3. Repo structure & ownership (⟐ deltas from Sui plan)

```
verimesh/
├─ apps/web/                    # ▲ A — + ⟐ balances panel + settlement feed
├─ services/agent/  services/mcp/   # ● B
├─ packages/
│  ├─ shared/                   # ◆ CONTRACT (sub-owned by file)
│  │   ├─ types.ts              #   + ⟐ EconomicState, Settlement, VerdictResult.kind
│  │   ├─ physics.ts            #   co-authored B+C, frozen
│  │   ├─ economics.ts          # ⟐ NEW — deterministic settlement model (co-authored B+C, frozen)
│  │   ├─ genio_blueprint.json  #   + ⟐ economic policy (price, budget floors, caps)
│  │   ├─ invariants.ts         #   ★ C — physical + ⟐ economic invariants
│  │   └─ scenarios.ts          #   ★ C — + ⟐ budget_breach scenario
│  ├─ sim/                      # ● B — advances physical + ⟐ economic state
│  ├─ verifier/                 # ★ C — physical + ⟐ economic checks
│  └─ chain/                    # ● B — 0G storage/compute + ⟐ Hedera (HTS/Agent Kit) [Sui client removed]
├─ supabase/                    # ◆ CONTRACT — + ⟐ balances, settlements tables
└─ docs/                        # plans, acceptance.md
```
**⟐ Removed:** `move/verimesh/` (no Move). **⟐ Added:** `packages/economics`, Hedera client in `packages/chain`, balances/settlements everywhere.

**⟐ How payments avoid burying B:** the subsystem is split — **A** owns the balances/settlement UI, **C** owns the economic invariants (extends the verifier), **B** owns only the Hedera execution + wiring settlement into `commit_state`. Payments are a team feature, not a B feature.

---

## 4. Collaboration protocol

**Identical to the Sui plan §4** (contract‑first, the mock seam, the `verify_constraints` seam, git workflow, comms, C onboarding/backstop). ⟐ Two additions:
- **A third frozen artifact at kickoff:** `packages/economics.ts` (the deterministic settlement model), co‑authored **B+C** alongside `physics.ts`, then frozen. Same rules as the physics seam.
- **The economic policy** (prices, budget floors, settlement caps) lives in `genio_blueprint.json` — B authors numbers, C reviews bounds (same pattern as the physical bounds).

---

## 5. Tech stack (⟐ deltas only; rest = Sui plan §5)

| Layer | ⟐ Change |
|---|---|
| On‑chain settlement | **Hedera** — `hedera-agent-kit` (HITL/policy‑constrained payments) + `@hashgraph/sdk` (HTS token transfers) over Hedera **testnet**. EVM/Hardhat path available if a Solidity settlement contract is preferred. |
| Economic model | **`packages/economics`** — pure deterministic settlement fn (no I/O). |
| Verifier | now checks **physical + economic** invariants (still pure TS + `fast-check`). |
| Removed | `@mysten/sui`, Sui Move package, **Move Prover stretch**. |
| ⟐ C stretch (new option) | Formal/property proof of **economic conservation** (no money minted between nodes) via `fast-check` or `z3-solver`; or Solidity **invariant tests (Foundry)** / Slither if you go the contract route. |

Everything else — Next.js, HeroUI v3, R3F/drei/postprocessing, Framer Motion, zustand, Supabase, 0G Compute (OpenAI‑compat) + 0G Storage, World ID IDKit, MCP — **unchanged**.

---

## 6. Shared contracts (⟐ deltas)

### 6.1 Types (`packages/shared/types.ts`) — ⟐ additions
```ts
export interface EconomicState { nodeId: string; balance: number; budgetFloor: number; earnRate: number; }
export interface Settlement { from: string; to: string; amount: number; reason: Action; hederaTxId?: string; }
export type GridState = { nodes: GridNode[]; edges: Edge[]; economy: EconomicState[] };  // ⟐ +economy

export type ViolationKind = 'physical' | 'economic';                                     // ⟐
export interface VerdictResult {
  verdict: 'VERIFIED' | 'VIOLATION_TRIGGERED' | 'ESCALATE';
  detail: string;
  violated?: { kind: ViolationKind; node: string; metric: string; value: number; bound: number }; // ⟐ +kind
  projected: Record<string, NodeMetrics>;
  settlements: Settlement[];   // ⟐ the deterministic settlements this action would produce
}
// The B↔C contract signature is unchanged: (state, action) => VerdictResult
```

### 6.2 Supabase schema — ⟐ new tables
- `balances(id pk, node_id, balance, budget_floor, earn_rate, updated_at)` — **realtime on** (drives the balances panel).
- `settlements(id pk, proposal_id fk, from_node, to_node, amount, reason, hedera_tx_id, ts)` — **realtime on** (drives the settlement feed).
- All Sui columns dropped from `commits`; add `hedera_tx_id`. Everything else unchanged.

### 6.3 What A subscribes to → ⟐ additions
| Table | Drives |
|---|---|
| `balances` | ⟐ live balances panel / per‑node balance in inspector |
| `settlements` | ⟐ scrolling settlement feed + HashScan links |
| (all others) | as in Sui plan §6.3 |

---

## 7. Simulation, economics & the verifier

Physical model (`physics.ts`), blueprint, detection, and the physical verifier are **identical to the Sui plan §7**. ⟐ Additions:

### 7.1 The economic model (`packages/economics.ts` — co‑authored B+C, frozen)
Pure deterministic `settle(state, action) → Settlement[]`:
- **REBALANCE_LOAD / ISOLATE_NODE** (load moves A→B): A pays B `price × load_moved` for absorbing work.
- **SCALE_UP**: grid treasury pays `price × capacity_added` to provision paid capacity.
- **THROTTLE_NODE / NO_OP / ESCALATE**: no settlement.
Prices, budget floors, and settlement caps come from `genio_blueprint.json`. The **sim (B)** applies settlements to `balances` on commit; the **verifier (C)** computes them noise‑free to check them *before* commit.

### 7.2 ⟐ Economic invariants (`invariants.ts` — ★ C)
```
EINV-1 (solvency):     ∀ node n after settlement:  balance(n) ≥ budgetFloor(n)
EINV-2 (policy cap):   ∀ settlement s:  amount(s) ≤ cap(load_moved, blueprint)
EINV-3 (conservation): Σ balance changes = external provisioning only  (no money minted node↔node)
SOUNDNESS: VERIFIED ⇒ physical INV-1..3 ∧ economic EINV-1..3 hold over horizon H
```

### 7.3 ⟐ The verifier gains an economic pass
After the physical projection (Sui plan §7.5), the verifier runs `settle()` on the projected state and checks EINV‑1..3. **Any breach → `VIOLATION_TRIGGERED` with `kind:'economic'`.** An action is VERIFIED only if it's physically *and* economically sound. Returns `settlements` for the UI + for `commit_state` to execute on Hedera.

### 7.4 ⟐ Scenarios (`scenarios.ts` — ★ C) — add one
- `ambiguous_cascade` — physical (as Sui plan); ⟐ its SCALE_UP + load transfer now emit settlements.
- `budget_breach` — **NEW**: an action physically fine but whose settlement drives a node below `budgetFloor` → economic VIOLATION → freeze → human. **Proves the economic verifier is load‑bearing.**
- `benign_spike` — verifies a simple THROTTLE (no settlement).

---

## 8. Stream A — Frontend/3D (⟐ deltas)

Same as Sui plan §8 (A0–A5), **plus:**
- **⟐ A3.5 · Economics UI (H16–H22)** — a **balances panel** (per‑node balance vs `budgetFloor`, animated number tweens on settlement) and a **settlement feed** (from/to/amount/reason, with **HashScan tx links**). Subscribe to `balances` + `settlements`. On the `budget_breach` freeze, the inspector highlights the offending balance (mirrors how physical violations highlight temp).
- **⟐ A5** audit drawer: replace "Sui digest → Sui explorer" with **"Hedera tx → HashScan"**; add the economic‑check detail when `violated.kind==='economic'`.

---

## 9. Stream B — Backend/web3 (⟐ deltas)

Same as Sui plan §9 (B0, B1 simulator, B3 0G Compute, B4 0G Storage, B5 World ID, B6 loop, B7 MCP, B8 harden), **with the Sui spike replaced and settlement added:**

**⟐ B2 · Hedera payments spike + go/no‑go (H4–H10, INTERLEAVED — start early).** *No Move — much lower risk than the Sui variant, but still a new SDK.*
- Hedera **testnet** account + HBAR faucet (portal.hedera.com). Create a small set of real accounts: a **treasury** + accounts for the demo‑critical nodes (e.g., node‑04, node‑07, node‑12, + 1–2 neighbors). Other nodes' balances live in Supabase only.
- Mint an **HTS token** ("GRID credits") for settlements (more on‑theme than raw HBAR), or use HBAR for simplicity.
- Fire a settlement transfer two ways: via **`@hashgraph/sdk`** (baseline, reliable) and via **`hedera-agent-kit`** (track‑aligned, HITL/policy mode). Keep `@hashgraph/sdk` as the fallback.
- **GO/NO‑GO at H10:** if a real settlement tx isn't landing on testnet → fall back to `@hashgraph/sdk` HBAR transfer (drop Agent Kit), or worst case mirror settlements in Supabase + anchor a single proof tx. *(Mentor if stuck >30 min.)*

**⟐ B6 · commit_state** now also executes the settlement: on VERIFIED → Supabase state + `balances` update + 0G audit + **Hedera HTS settlement tx** (store `hedera_tx_id` in `settlements`/`commits`). Wire the Hedera Agent Kit HITL so privileged/large settlements can require the human — reusing or layering with the World ID gate (see ⟐ note below).

**⟐ World ID × Hedera Agent Kit HITL:** you now have two "human‑in‑the‑loop" mechanisms. Don't duplicate — **layer them:** World ID proves *who* (unique human) authorizes the override; Hedera Agent Kit's policy/HITL constrains *what payment* that authorization is allowed to execute. Frame in the pitch as "identity‑gated **and** policy‑gated agent payments" — that's two prize tracks (World AgentKit + Hedera Agentic Payments) hitting one moment.

---

## 9C. Stream C — Verifier / formal / correctness (⟐ deltas)

Same as Sui plan §9C (C0 kickoff, C1 invariant spec, C2 verifier, C3 property tests, C4 acceptance harness, C5 cross‑stream QA), **plus economics woven in:**
- **⟐ C1**: also authors `economics.ts` (paired B+C) + the **economic invariants** EINV‑1..3.
- **⟐ C2**: verifier's economic pass (§7.3); unit‑test `budget_breach` → economic VIOLATION.
- **⟐ C3**: `fast-check` also fuzzes **economic soundness** (VERIFIED ⇒ EINV‑1..3) and **conservation** (no minting) across random states.
- **⟐ C4** acceptance harness adds: economic VIOLATION opens a gate; settlement fires only on VERIFIED; Hedera tx id resolves on HashScan; balances conserve.
- **⟐ C stretch** swaps the Move Prover (C7) for **economic‑conservation proof** (Z3, or Foundry invariant tests if you take the Solidity‑contract route). Same gating: only after baseline is green.

---

## 9D. Building without C (⟐ deltas)

Identical decoupling to the Sui plan §9D — A renders `verdicts` rows, B builds the loop against the stub and swaps at H8 or keeps the fallback, and the decision gate is still H6/H8. **Build the fallback verifier from the Sui §9D spec**, then add the ⟐ economic pass after the physical projection passes:

```ts
import { settle, settlementCap } from '@verimesh/shared/economics';   // co-owned, frozen

// ...after the trajectory clears the physical bounds, before returning VERIFIED:
const settlements = settle(lastFrameState, action);          // deterministic consequence of the action
const bal = applySettlements(structuredClone(state.economy), settlements);
for (const e of bal) {                                       // EINV-1 solvency
  if (e.balance < e.budgetFloor)
    return violation('economic', e.nodeId, 'balance', e.balance, e.budgetFloor, trajectory);
}
for (const st of settlements) {                              // EINV-2 policy cap
  const cap = settlementCap(action, blueprint);
  if (st.amount > cap)
    return violation('economic', st.from, 'amount', st.amount, cap, trajectory);
}
// EINV-3 conservation: assert Σ balance change === external provisioning only
return { verdict: 'VERIFIED', detail: 'physically + economically in-envelope', projected, settlements };
```

**⟐ The caveat that matters for this variant:** in the Sui plan, C's absence costs only *rigor*. Here C also owns the **economic invariants**, and the `budget_breach` economic‑violation is the scenario that *earns the payments track*. So B's fallback **must** include the economic pass above for `budget_breach` to demo — otherwise that scenario is cut and Hedera degrades from "we *verify* money moves" to merely "we moved money." Budget ~1 extra hour for B to port `settle()` + the three EINV checks. **If C is your least‑certain teammate, this is the strongest single argument for the Sui variant.**

---

## 9E. Live device node (Termux) (⟐ pointer)

Use the Sui plan **§9E** as-is — the real-phone DePIN node (Samsung S22 via Termux, cellular) is variant-agnostic. ⟐ In this variant, assign the S22 to an **independent operator** whose node **earns and settles real Hedera payments** for the load it absorbs — so the live physical device isn't just reporting telemetry, it's a *paid participant in the on-chain economy*. Strongest possible "real DePIN node" moment.

---

## 10. Timeline (⟐ deltas from Sui plan §10)

Same checkpoints, with these changes:
| Hour | ⟐ Change |
|---|---|
| **H0–H2** | + freeze `economics.ts` (paired B+C) + economic invariants draft. |
| **H6** | Verifier ambiguous test green **+ ⟐ economic pass stubbed**. |
| **H10** | ⟐ **HEDERA GO/NO‑GO** (real settlement tx landing) — *lower risk than Sui/Move*. |
| **H14** | Property suite green **+ ⟐ economic fuzzing green**. |
| **H18** | World ID end‑to‑end **+ ⟐ first real settlement wired into commit_state**. |
| **H22** | Acceptance harness green **incl. ⟐ economic claims**; A's balances/settlement UI live. |
| **H26** | ⟐ **Both scenarios run headless** (ambiguous_cascade + budget_breach → freeze → resume → settle). |
| **H34** | Feature freeze; rehearse **both** beats. |

**⟐ Cut order if crunched:** drop `budget_breach` scenario → drop Agent Kit (use raw `@hashgraph/sdk`) → drop MCP → mirror settlements in Supabase + one anchor tx. Protect: World + 0G + *one* real Hedera settlement in the main beat.

---

## 11. Risk register (⟐ deltas)

| Risk | ⟐ Change vs Sui plan |
|---|---|
| **Move** | **Removed** (no Move in this variant). |
| ⟐ **Hedera SDK / Agent Kit** (new) | Med. Baseline `@hashgraph/sdk` transfer first; Agent Kit as track‑aligned layer with raw‑SDK fallback. H10 go/no‑go. |
| ⟐ **Payments subsystem scope** | Med‑High. Split across A (UI) + B (exec) + C (invariants) so no single lane drowns; `budget_breach` is the first cut. |
| ⟐ **Narrative dilution** | Med. Keep payments **load‑bearing** (economic VIOLATION is real) and **deterministic** (one LLM decision only) so the story deepens, not muddies. |
| World ID, 0G Compute/broker, 3D perf, merge/blocking, scope creep, submission crunch | **Unchanged** from Sui plan §11. |

---

## 12. Demo video & submission (⟐ deltas)

**Video** — same structure as Sui plan §12, ⟐ show **both** the physical freeze *and* the economic freeze, and the **live balances + Hedera settlement (HashScan)** on recovery. Line to land: *"the referee checks the physics **and** the economics — and the human authorizes real money."*

**Submission** — ⟐ select **World + 0G + Hedera**; in the Hedera writeup name **HTS + Hedera Agent Kit (HITL/policy‑constrained agent payments)**; include `hedera_tx_id`s / HashScan links as proof.

---

## 13. Judging map (⟐ deltas)

| Criterion | ⟐ Change |
|---|---|
| **Technicality** | + verifier checks **economic** invariants (fuzzed conservation) alongside physical; real HTS settlements. |
| **Originality** | ⟐ **stronger** — "an agent that manages critical infra *and its economics*, both verified, both human‑gated." Two HITL tracks converge in one moment. |
| **Practicality** | + a real settlement layer, not just state. |
| **Usability** | + live balances + settlement feed. |
| **WOW** | + the economic freeze (rejected on *money* grounds) + real testnet payments moving live. |

---

## 14. Pre‑flight (⟐ deltas)

**B (add):** **Hedera testnet** account + **HBAR faucet** (portal.hedera.com); decide HTS token vs HBAR; `hedera-agent-kit` + `@hashgraph/sdk` installed; **remove** Sui/Move items.
**⟐ `.env` (swap the Sui block):**
```
HEDERA_NETWORK=testnet  HEDERA_OPERATOR_ID=  HEDERA_OPERATOR_KEY=
HEDERA_TREASURY_ID=  HEDERA_GRID_TOKEN_ID=      # if using an HTS token
```
Everything else (Supabase, World, 0G, OpenAI/Anthropic fallback) unchanged.

---

## 15. First 2 hours (⟐ deltas)

Same as Sui plan §15, ⟐ with one more frozen artifact and the Hedera swap:
- **All three (H0–H1):** contracts + schema (now incl. `balances`/`settlements`) + `genio_blueprint.json` (incl. economic policy).
- **B + C pair (H1–H2):** freeze **`physics.ts` and `economics.ts`** together.
- **B:** seed (incl. balances + a sample settlement + both freeze types) + `mockLoop` + verifier stub.
- **C:** `invariants.ts` (physical + economic) + `scenarios.ts` (incl. `budget_breach`).
- **A:** dark shell + realtime hook rendering seeded `nodes` **and** `balances`.

---

### Appendix — Hedera sources
- Hedera Agent Kit (HCS/HTS/accounts; HITL or autonomous): [deep dive](https://hedera.com/blog/deep-dive-into-the-hedera-agent-kit-plugins-tools-and-practical-workflows/), [Hedera & agentic AI](https://hedera.com/blog/hedera-leading-the-charge-in-agentic-ai/), [AI bounties (payment‑gated / policy‑constrained payments)](https://ai-bounties.hedera.com/)
- Hedera EVM + tooling: [deploy with Hardhat](https://docs.hedera.com/hedera/getting-started-evm-developers/deploy-a-smart-contract-with-hardhat), [Smart Contract Service](https://hedera.com/service/smart-contract-service/), [awesome-hedera](https://github.com/hashgraph/awesome-hedera)
- (World ID, 0G Compute, 0G Storage sources: see the Sui plan appendix.)
