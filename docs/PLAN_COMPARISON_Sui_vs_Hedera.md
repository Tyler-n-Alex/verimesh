# Verimesh — Third Chain: Sui vs Hedera (Plan Comparison)

Quick decision aid for the third partner track. Full plans:
[Sui version](IMPLEMENTATION_PLAN.md) · [Hedera / Path B version](IMPLEMENTATION_PLAN_HEDERA.md).

---

## How the two plans differ

They share **everything except the third chain**: same **World + 0G** anchors, same **3‑person** structure, same **Supabase/realtime** seam, same **3D frontend**, same **LLM‑proposes → verifier‑disposes → human‑breaks‑ties** loop. The Hedera variant marks every change with `⟐`.

The one real divergence:

> **Sui adds on‑chain *state*** (a node object per grid node); **Hedera adds an on‑chain *economy*** (nodes pay each other).

That single choice cascades into:

| Dimension | **Sui** | **Hedera (Path B)** |
|---|---|---|
| **What the chain holds** | Node state transitions | Real payment settlements (HTS) |
| **The verifier's job** | Physical safety only | Physical **+ economic** invariants (an action can be rejected purely on money grounds) |
| **New surface area** | — | `packages/economics` model, `balances`/`settlements` tables, balances panel + settlement feed, a second demo scenario (`budget_breach`) |
| **Who does the work** | Chain work sits almost entirely on **B** | Payments subsystem **split across A (UI) + B (execution) + C (economic invariants)** so B isn't buried |
| **Skill risk** | Needs **Move** (nobody knows it) | **EVM/HTS** (no Move) |

---

## Sui plan — pros / cons

**Pros**
- Smallest, cleanest build — payments subsystem doesn't exist; tightest narrative.
- Object‑per‑node is an elegant, on‑theme fit for Sui's "Best App" prize.
- Chain work is contained to B; A and C are unaffected.

**Cons**
- **Move is your #1 risk** — neither dev knows it; real chance of an H10 cut to a stub.
- Smaller pool (~$4k realistic).
- If Move fails, the third integration collapses to a story, not a working demo.

---

## Hedera plan (Path B) — pros / cons

**Pros**
- **Bigger pool** — targets AI & Agentic Payments (your stated driver), plus World AgentKit and Hedera Agent Kit HITL converge in one moment (two HITL tracks, one demo beat).
- **No Move** — EVM/HTS, which is closer to your 0G/EVM experience.
- **Richer story + WOW** — an agent that governs infra *and its economics*, with a freeze that can trigger on money, and real testnet payments moving live.
- Payments load is shared across all three people.

**Cons**
- **Biggest build of the three options** — a whole economic subsystem (model, tables, UI, second scenario, Hedera SDK/Agent Kit).
- New scope on an already‑ambitious plan (World + 0G Compute + 0G Storage + now payments); crunch risk is higher.
- **Narrative‑dilution risk** if payments end up decorative — they must stay load‑bearing (the `budget_breach` economic‑violation is what earns the track) and deterministic (one LLM decision only).
- Hedera Agent Kit is a new SDK — lower risk than Move, but still an H10 go/no‑go with a raw‑`@hashgraph/sdk` fallback.

---

## If C (the formal‑logic dev) is uncertain

C is an **upgrade path, not a critical‑path dependency** in both plans — A and B build against frozen contracts (the `verify_constraints` signature + the `verdicts` schema), and B can build a fallback verifier from `physics.ts` (spec'd in each plan's **§9D — Building without C**). But C's absence has a **different blast radius**:

- **Sui:** C's absence costs only *rigor* (property‑fuzzing, soundness proof, formal QA). The demo still runs on B's fallback verifier. **Pure upside.**
- **Hedera:** C also owns the **economic invariants**, and the `budget_breach` economic‑violation is what earns the payments track. Without C, B must port the economic check into the fallback (~1h) or cut that scenario — degrading the Hedera story.

**→ If C is your least‑certain teammate, that's a quiet point in Sui's favor.**
