# Verimesh — Implementation Plan (3‑person: 2 devs + 1 formal‑logic/correctness)

> **Event:** ETHGlobal Lisbon 2026 · **Hard deadline:** Sun **July 26, 09:00 WEST** (no late submissions).
> **Track:** Classic "Start Fresh" — *all* code written during the event, **incremental commits required** (large single commits risk DQ).
> **Partner prizes to select (max 3):** **World**, **0G**, **Sui**.
> **Judging:** Technicality · Originality · Practicality · Usability (UI/UX/DX) · WOW Factor.

This plan is the source of truth for the weekend. It's written so **three people can work fully in parallel without clobbering each other**. Read §4 (Collaboration Protocol) first — it's the whole reason the rest is structured the way it is.

**Team:**
- **A — Frontend/3D** (owns `apps/web`).
- **B — Backend/web3** (owns the agent loop + all chain integrations + simulator + Supabase pipeline).
- **C — Verifier/formal + correctness** (owns the deterministic verifier, the safety‑invariant spec, the test/acceptance harness; later, cross‑stream QA). **C's exact toolkit (TypeScript fluency, SMT/solver experience, Move) is currently unknown — the plan self‑calibrates in a paired first session (§4.6) and B backstops C on the critical path so nothing load‑bearing depends on an unproven skill.**

---

## 0. Locked decisions

| Decision | Choice | Consequence for the plan |
|---|---|---|
| Team | **A = FE/3D**, **B = Backend/web3**, **C = Verifier/formal + correctness** | 3 folder‑disjoint lanes; one co‑owned seam (the physics model) handled by pairing (§4.5). |
| Effort | A & B all‑in ~35–40h; **C availability/toolkit TBD** | C's role is structured so partial availability or unknown skill still adds value; B is the verifier backstop. |
| Third chain | **Sui** (object‑per‑node) | Needs Move. Neither A/B knows Move → biggest risk. Early spike + go/no‑go gate at H10. |
| 0G depth | **0G Compute for inference from the start** | Inference via OpenAI‑compatible 0G broker; verifiability attestation folded into the 0G audit log. Fallback adapter behind same interface. |
| Data layer | **Supabase** (Postgres + Realtime) as operational seam; **0G Storage** as the immutable audit trail | Decided: 0G can't do realtime/high‑frequency writes — it stays the cold audit layer, not the hot DB. |
| Familiarity | Known: **0G**, **R3F**. New: **World ID**, **Sui Move**. **C: unknown** | Front‑load World‑ID & Sui spikes; C ramps via a paired kickoff. |
| World surface | **Next.js web app + IDKit cloud verify** (`verifyCloudProof`) | Runs on a laptop at the booth; AgentKit "human‑backed agent" narrative layered on top. |
| Aesthetic | **Dark, clean enterprise SaaS, no neon**, 3D node‑grid as hero, tasteful motion | HeroUI v3 dark theme; muted‑but‑legible status colors; subtle bloom only. |
| 3D fidelity | **Stylized instanced grid + FX** | Instanced nodes, animated dependency links, subtle bloom/DOF, status‑driven color/pulse. No heavy asset pipeline. |

**Explicit non‑goals (say no to these all weekend):** grid‑wide optimization, multi‑decision agents, real hardware, mobile app, auth/multi‑tenant, production RLS, more than one LLM decision point. One narrow decision — *"given a detected anomaly, return one action from a fixed menu"* — is the whole agent.

---

## 1. North Star & the demo beat

**One sentence:** *An autonomous agent watches a 3D mesh of infra nodes; the LLM proposes fixes, a deterministic verifier simulates them against a structural blueprint, only in‑envelope actions run, and any rejected/high‑privilege action freezes the system until a World‑ID‑verified human signs off — with every decision written immutably to 0G and every verified state transition committed as a Sui object.*

**The 90‑second demo beat (build everything to serve this):**
1. Live 3D mesh, mostly healthy. Reasoning trace ticking calmly.
2. **Inject the ambiguous anomaly** on `node‑07`: rising temp **+** falling throughput **+** neighbor `node‑12` just went offline. Rules can't classify it (benign spike or cascade?).
3. LLM **diagnoses** → proposes `ISOLATE_NODE(node‑07)`. Trace shows the reasoning + confidence.
4. Verifier **simulates**: isolating 07 dumps its load onto `node‑12`'s neighbors → projected temp breaches thermal limit → **VIOLATION**.
5. Screen goes red: **"Emergency Human Intervention Required."** Everything freezes.
6. Operator **scans World ID** → authorized → picks the safe path: `SCALE_UP` **then** `ISOLATE_NODE`.
7. Verifier re‑simulates → **VERIFIED** → commit: Sui tx fires (object transition), 0G audit record written. Mesh returns to green.
8. Click any decision → open the **0G audit trail** (diagnosis + verdict + 0G‑Compute validity attestation + Sui tx digest).

Every component is *necessary* for the story to resolve. That's what wins Technicality + WOW.

---

## 1B. Product thesis & positioning (say this at the booth)

Sponsor judges reward projects with a *real chance to become a real product* — and their "why does this need a blockchain?" test is the **same** question. There's exactly one framing that passes both: **DePIN.** Pitch it as a generic "AI + guardrails" tool and you lose the crypto rationale; pitch it as the trust layer for decentralized infra and every integration becomes necessary.

**What it is (one line):** *Verimesh is the safety + coordination layer that lets an AI autonomously manage a **decentralized** physical‑infrastructure network without anyone having to trust it — the AI proposes, a deterministic verifier disposes, a World‑ID human breaks ties, and every decision + state transition is trustlessly auditable on‑chain.*

**Who it's for (name it — never say "critical infra"):** operators of DePIN compute/sensor networks (io.net, Akash, Render, Helium‑style) where **independently‑owned** nodes must be kept healthy and coordinated by parties who don't trust each other.

**Why the crypto is load‑bearing (the whole point is trustlessness between untrusting operators):**
- **World ID** — proves a *real, unique human* (not a rival's bot or another agent) authorized a privileged override. In an agent‑saturated network, "was this a human?" is a real access question.
- **0G** — a tamper‑proof audit trail + verifiable inference that *no single operator can forge* — essential when the parties don't trust each other or the AI.
- **Sui** — verified node state lives on‑chain as objects, so every operator reads the same trustless source of truth for what the AI did.

**Sim → real is one adapter (say this out loud):** `get_telemetry_data()` is a clean boundary — swap the simulator for a Prometheus / IoT / cloud‑metrics feed and the identical agent + verifier + human‑gate stack runs on live infrastructure. The demo is simulated **hardware**, not simulated **architecture**.

**The "why does this need a blockchain?" kill‑shot (rehearse verbatim):** *"Because the operators are independent and don't trust each other or the AI. A centralized log can be edited by whoever hosts it; a centralized override can be faked. We need an audit no operator can forge, an authorization a bot can't spoof, and a shared state no one can unilaterally rewrite. Remove the chain and a multi‑party DePIN network can't safely hand control to an AI at all."*

**What we're NOT (avoid the trap):** not a generic "AI + guardrails" wrapper (that wouldn't need a chain), not a grid optimizer. One narrow, safe, *trustless* decision loop for multi‑party infra.

---

## 1C. Making the build *show* the thesis (cheap DePIN reinforcements)

**Verdict on restructuring: don't.** The architecture already fits — a rebuild would burn hours you don't have. The gap is that the *demo* shows an anonymous grid while the *pitch* claims a multi‑operator trustless network. Close it with a thin **"DePIN skin"** — metadata + framing, not new systems. **Scope guardrail: do NOT build tokenomics, staking, or slashing — that's the trap the framing invites. *Show* DePIN, don't *build* an economy.**

| # | Change | Where it lands | Cost | Payoff |
|---|---|---|---|---|
| 1 | **`operator` dimension** — each node belongs to one of 2–3 independent operators. **Bake into the H0 frozen contract:** `nodes.operator_id` + `GridNode.operator`. | §6 schema/types (H0) | ~20 min | **Keystone.** Turns "a grid" into "a multi‑party network." Everything below depends on it. |
| 2 | **Operator‑aware 3D + UI** — color‑group / badge nodes by operator; small operator legend. | A / §8 | ~30 min | Judges *see* independent owners at a glance. |
| 3 | **Cross‑operator freeze** — flag actions that impact a *different* operator's nodes as a human‑gate trigger (alongside VIOLATION); the modal names both ("Isolating **Operator A**'s node‑07 would breach **Operator B**'s node‑12"). | detector/verifier + freeze modal | ~45 min | Makes the human gate *necessary because of multi‑party structure*, not just "high privilege." |
| 4 | **Audit drawer → "proof / dispute" view** — same 0G root + Sui digest + attestation, framed from an operator's POV: "Operator B can independently verify what the AI did — tamper‑proof, un‑editable." | A / §8 audit drawer | ~15 min (copy) | Makes *trustlessness felt*, not just claimed. |
| 5 | **DePIN‑native telemetry labels** — GPU util, jobs/sec, uptime‑SLA, power (same physics, DePIN naming/units). | blueprint + sim + inspector | ~30 min | Reads as a real compute network, not abstract sensors. |
| 6 | **Visibly swappable telemetry source** — simulator implements a `TelemetrySource` interface with a `// swap for PrometheusSource / IoTSource` stub. *(Stretch: wire ONE real metric — e.g. the demo laptop's real CPU temp on one node — so you can say "this node is live.")* | `packages/sim` | ~20 min stub / ~1h real | Makes "one adapter from real" credible, not hand‑waved. |

**Demo beat, reframed to two operators (no new work):** assign `node‑07 → Operator A`, `node‑12 → Operator B`. The ambiguous anomaly becomes a *cross‑operator conflict* — the fix for A's node would harm B's node, so neither party trusts the other or the AI, and *that's why* you need a neutral World‑ID human + an audit nobody can forge. Same beat, DePIN meaning.

---

## 2. Architecture at a glance

The system is **three tiers plus the chains**, with data flowing top-to-bottom and back up:

| Tier | What runs there | Owner | How it connects |
|---|---|---|---|
| **Frontend** — Next.js + R3F | 3D mesh (hero), reasoning trace, event log, node inspector, action menu, freeze modal, World ID widget | **A** | Subscribes to Supabase (realtime, read-only); calls B's `/api/worldid/*`. **No chain code.** |
| **Supabase** — Postgres + Realtime *(the seam)* | `nodes`, `edges`, `telemetry`, `events`, `proposals`, `verdicts`, `commits`, `human_gates` | **shared contract** | **B writes** (service key); **A subscribes** (anon). |
| **Agent service** — Node loop | the 5-step loop below; imports the verifier | **B** (verifier authored by **C**) | Reads the simulator; writes Supabase + the chains. |
| **Chains** | **0G Compute** (attested inference) · **0G Storage** (audit trail) · **Sui** (node-object state) | **B** | Called by the agent service on each decision. |

**The agent loop (Stream B), step by step:**

1. `get_telemetry_data()` — pull the latest simulator window.
2. **detect anomaly** — deterministic rules (no LLM).
3. **diagnose + propose** — the *one* LLM decision, via **0G Compute**.
4. `verify_constraints()` — **C's** deterministic projection → `VERIFIED` / `VIOLATION` / `ESCALATE`.
5. `commit_state()` — on **VERIFIED**: state → Supabase, audit → 0G, transition → Sui. On **VIOLATION / low confidence** → **freeze** → **World ID** human sign-off → re-verify → commit.

**End-to-end flow (one line):** Simulator → Supabase → [ detect → LLM propose → verify → commit ] → Supabase → Frontend 3D.

**Freeze branch:** verifier `VIOLATION` → `human_gates` (pending) → **World ID** → operator picks the safe action → re-verify → commit → mesh recovers.

**Design rules that make the split clean:**
- **Supabase is the only thing the frontend talks to.** All chain complexity lives in Stream B and is *referenced by hash/digest* in Supabase rows. Frontend never imports a chain SDK except the World ID **widget** (which only calls B's `/api/worldid/*` routes).
- **All chain writes are server‑side** (private keys + testnet funds). Fits the FE/BE boundary.
- **The verifier is a pure function C delivers, B imports.** `verify_constraints(state, action) → VerdictResult` runs *inside* B's agent loop but its code lives in `packages/verifier` (C's). This function signature is the **B↔C contract** — freeze it early and both work independently against it.
- **The physics/dynamics model lives in `packages/shared` and is co‑authored once, then frozen.** Both B's simulator (advancing real state) and C's verifier (projecting a hypothetical action) import it read‑only. "The verifier simulates against the same structural blueprint" — literally true, and defensible to judges.

---

## 3. Repo structure & ownership map

Monorepo (pnpm workspaces — ~15 min setup, done once in the kickoff). Ownership is folder‑level so you never edit the same file.

```
verimesh/
├─ apps/
│  └─ web/                      # ▲ STREAM A owns entirely
│     ├─ app/ components/ three/ hooks/ lib/
├─ services/
│  ├─ agent/                    # ● STREAM B — the loop orchestrator (imports packages/verifier)
│  └─ mcp/                      # ● STREAM B — MCP server wrapping the 3 tools
├─ packages/
│  ├─ shared/                   # ◆ CONTRACT — sub‑owned to avoid collision (see below)
│  │   ├─ types.ts              #   all types + ProposalSchema (zod)         — set at kickoff, frozen
│  │   ├─ physics.ts            #   pure deterministic dynamics fn           — co‑authored B+C, frozen
│  │   ├─ genio_blueprint.json  #   node params + topology (numbers)         — B authors, C reviews bounds
│  │   ├─ invariants.ts         #   safety invariants / envelope spec        — ★ STREAM C
│  │   └─ scenarios.ts          #   scenario defs + expected verdicts        — ★ STREAM C
│  ├─ sim/                      # ● STREAM B — telemetry simulator (imports physics + scenarios)
│  ├─ verifier/                 # ★ STREAM C — verify_constraints (imports physics + invariants)
│  └─ chain/                    # ● STREAM B — 0G storage/compute + Sui clients
├─ move/verimesh/               # ● STREAM B — Sui Move package  (spec blocks: ★ C stretch)
├─ supabase/                    # ◆ CONTRACT — migrations + seed (B owns, A+C review schema)
└─ docs/                        # this plan, blueprint notes, demo script, acceptance criteria (★ C)
```

- `◆ CONTRACT` folders are the **only** shared‑edit zones. `packages/shared` is **sub‑owned by file** (see comments above) so even inside the contract you rarely touch the same file. Announce contract changes in chat.
- Everything else has a single owner → merge conflicts are designed out.
- Deploy: **`apps/web` → Vercel**. **Supabase hosted** (free tier). **`services/agent` + `services/mcp` run locally on B's laptop during the demo** (lets B inject the scenario live and control pacing).

---

## 4. Collaboration protocol (read this one twice)

The biggest failure modes for a small hackathon team are **blocking each other** and **merge hell**. Both are designed out. With three people the extra rule is: **the two seams (B↔A = Supabase schema; B↔C = the `verify_constraints` signature) are frozen early and treated as sacred.**

### 4.1 The contract‑first rule
Nothing real gets built until the seams exist. In the **first 60–90 minutes, together (all three)**, you produce:
1. `packages/shared/types.ts` + `ProposalSchema` + the `verify_constraints` / `VerdictResult` signature — the **two contracts** (§6).
2. `supabase/migrations/0001_init.sql` — the schema (§6).
3. `packages/shared/physics.ts` — the deterministic dynamics fn (pair **B+C** — see §4.5/§4.6).
4. `packages/shared/genio_blueprint.json` + `invariants.ts` + `scenarios.ts` — topology, bounds, safety invariants, demo scenarios (§7).

Once these exist: **A works against seeded fake data, B builds the real pipeline, C builds the verifier + tests against the frozen physics + invariants.** All three reconverge only at integration checkpoints. Nobody is ever blocked.

### 4.2 The mock seam (how A is never blocked)
B writes `supabase/seed.ts` **first** — one realistic frame of nodes/edges/telemetry/events + a sample proposal+verdict+freeze. A builds the entire UI against that seed + a `mockLoop.ts` that cycles states (healthy→warning→violation→freeze→resolved) on a timer. **A's definition of done doesn't depend on B's loop or C's verifier** — only on the schema being stable.

### 4.3 The verifier seam (how B and C are never blocked on each other)
The moment `verify_constraints(state, action) → VerdictResult` is frozen (H1), **B stubs it** (`() => ({verdict:'VERIFIED', ...})`) and builds the whole loop against the stub, while **C builds the real implementation** in `packages/verifier`. B swaps the stub for C's real function at the H8 checkpoint — a one‑line import change. Neither waits on the other.

### 4.4 Git workflow (and satisfying the "show your history" rule)
- `main` stays green. Three long‑lived branches: `stream/web` (A), `stream/agent` (B), `stream/verifier` (C).
- **Commit small and often** (every 20–40 min). Judges can DQ for large single commits / missing history — frequent commits are a *requirement*. Conventional‑ish messages.
- Merge to `main` at each integration checkpoint (§10) via fast PR/merge — never a giant end‑of‑weekend integration.
- Folder‑disjoint ownership → trivial merges except in `◆ CONTRACT` → coordinate those in chat.
- Maintain a `# AI attribution` README section as you go (rules require it for prize eligibility); include this plan + `docs/acceptance.md` as spec artifacts.

### 4.5 The one co‑owned seam: the physics model
`packages/shared/physics.ts` is used by B's simulator *and* C's verifier. To avoid collision: **author it once, paired (B+C), in the first 2 hours, then freeze it.** After freeze it's read‑only for both. If it must change later, it's a chat‑announced interrupt (like a schema change). This is the only file two people co‑author; keep it small and pure (no I/O, no randomness inside — noise is added by the sim *around* it, so the verifier's noise‑free projection uses the identical core).

### 4.6 Onboarding C when their toolkit is unknown (self‑calibrating)
You can't pre‑assess C, so the plan finds their level by **pairing, not interviewing**:
- **H0–H2, C pairs with B** on `physics.ts` + the verifier skeleton. Within that session you'll *see* C's TS fluency and whether any solver/formal‑tooling instinct shows up. Three outcomes, all covered:
  - **C is TS‑fluent** → C owns `packages/verifier` + `fast-check` tests outright (baseline in §11‑C). Best case.
  - **C thinks formally but is rusty in TS** → C owns the *specifications* (`invariants.ts` as commented logic, `scenarios.ts`, `docs/acceptance.md`, the property definitions in prose) and **pairs with B to wire them into code**. Still huge value; B implements, C directs and reviews.
  - **C has real SMT/solver or Move experience** (surfaces in the pairing) → unlock the stretch tiers (§11‑C: Z3‑backed verification, Move Prover specs) *on top of* the baseline.
- **B is the verifier backstop.** Because B co‑authors the physics + verifier skeleton and builds the loop against the stub, **B can carry the verifier to "good enough for the demo" if C stalls.** The critical path never solely depends on C.
- **C's guaranteed‑value deliverables need zero special tooling:** the written safety‑invariant spec, the scenario/expected‑verdict table, and the acceptance harness (pitch‑claim → test). Even a C who barely touches TS makes the project measurably more rigorous and demo‑proof.

### 4.7 Comms cadence
- **15‑min standup every ~4h**: "done / doing / blocked / any contract change needed." Literally 5 minutes.
- **Contract changes are interrupts:** changing `packages/shared`, the Supabase schema, or the `verify_constraints` signature → announce in chat *before* editing so others pull immediately. These are the only things that silently break someone.
- **Blocked > 20 min on an unfamiliar SDK/tool → escalate:** mentor (`#mentorship-help` / high‑vis jackets) or the §11 fallback. Applies to World ID, Move — and to C if the stack is unfamiliar (pair with B rather than grind).

### 4.8 Skills to invoke while building (this harness)
- **A (frontend):** `heroui-react`, `r3f-best-practices`, `three-best-practices`, `threejs-postprocessing`, `next-best-practices`, `frontend-design`, `animate`/`polish`.
- **B (backend):** `supabase-postgres-best-practices`, `security-best-practices` (light pass on API routes).
- **C (verifier/formal):** `security-best-practices` for reasoning about the untrusted‑LLM → trusted‑checker boundary; otherwise standard TS + `fast-check`.

---

## 5. Tech stack (pinned intentions)

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js (App Router)** | Vercel deploy. API routes host World‑ID sign/verify. |
| UI | **HeroUI v3** (Tailwind v4 + React Aria) | Dark theme, restrained. Invoke `heroui-react`. |
| 3D | **three.js + @react-three/fiber + @react-three/drei** | Instanced mesh, `Line`/`QuadraticBezierLine` edges, `OrbitControls`. |
| 3D FX | **@react-three/postprocessing** | Subtle `Bloom` + optional `DepthOfField`, `Vignette`. No neon. |
| Motion (2D) | **Framer Motion** | Panel transitions, freeze‑modal entrance, number tweens. |
| State (client) | **zustand** | Bridge Supabase realtime → R3F. |
| Data | **Supabase** (Postgres + Realtime + JS client) | Operational source of truth for the frontend. |
| Agent runtime | **Node + tsx**, long‑running loop | `services/agent`. |
| LLM | **0G Compute** via **OpenAI SDK** | `@0gfoundation/0g-compute-ts-sdk`; `processResponse` for attestation. Fallback → OpenAI/Anthropic behind a flag. |
| Schema enforcement | **zod** + retry loop | Validate LLM JSON; retry ≤2. |
| **Verifier** | **Pure TS** (`packages/verifier`) + **`fast-check`** (property tests) | ★ C. Deterministic projection over `physics.ts` + invariant check. |
| Verifier stretch | **`z3-solver`** (Z3 WASM, in‑process) | ★ C stretch — only if solver skill surfaces. SMT‑backed verification / counterexamples. |
| Audit storage | **0G Storage** `@0glabs/0g-ts-sdk` | Node‑side `indexer.upload()` of each decision record. |
| On‑chain state | **Sui Move** + `@mysten/sui` | Object‑per‑node; one tx per verified commit. |
| On‑chain stretch | **Move Prover** (`spec` blocks) | ★ C stretch — only if Move skill surfaces + Prover works on Sui testnet. |
| Identity gate | **World ID** `@worldcoin/idkit` + `verifyCloudProof` | Cloud verify in a Next API route. |
| Agent "hands" | **MCP server** (`@modelcontextprotocol/sdk`) | Wraps the 3 tools. Cut to direct calls if time‑short. |

---

## 6. Shared foundations — THE CONTRACTS (build first, together)

### 6.1 Core types (`packages/shared/types.ts`)
```ts
export type NodeStatus = 'healthy' | 'warning' | 'violation' | 'awaiting_human' | 'isolated' | 'offline';

export interface NodeMetrics {   // one telemetry tick
  ts: number; load: number;      // 0..1 utilization
  temp: number;                  // °C
  throughput: number;            // ops/s
  power: number;                 // W
  mem: number;                   // 0..1
  fanRpm: number;
}
export interface GridNode {
  id: string; name: string;
  pos: [number, number, number]; // grid position for 3D
  status: NodeStatus;
  metrics: NodeMetrics;          // latest tick
}
export interface Edge { from: string; to: string; weight: number; } // dependency/topology
export type GridState = { nodes: GridNode[]; edges: Edge[] };        // full snapshot the verifier consumes

export const ACTIONS = ['REBALANCE_LOAD','THROTTLE_NODE','ISOLATE_NODE','SCALE_UP','NO_OP','ESCALATE_TO_HUMAN'] as const;
export type Action = typeof ACTIONS[number];

export interface Proposal {      // LLM output, schema-enforced (zod mirror ProposalSchema)
  diagnosis: string;
  proposed_action: Action;
  target_nodes: string[];
  expected_effect: string;
  confidence: number;            // 0..1
  risk_flags: string[];
}
export type Verdict = 'VERIFIED' | 'VIOLATION_TRIGGERED' | 'ESCALATE';
export interface VerdictResult {
  verdict: Verdict;
  detail: string;                          // human-readable "why"
  violated?: { node: string; metric: keyof NodeMetrics; value: number; bound: number };
  projected: Record<string, NodeMetrics>;  // per-node projection at horizon (drives UI "what-if")
}

// ★ THE B↔C CONTRACT — freeze this signature at H1:
export type VerifyConstraints = (state: GridState, action: Proposal) => VerdictResult;
```

### 6.2 Supabase schema (`supabase/migrations/0001_init.sql`) — the tables A subscribes to
- `nodes(id pk, name, x, y, z, status, metrics jsonb, updated_at)`
- `edges(id pk, from_node, to_node, weight)`
- `telemetry(id pk, node_id, ts, load, temp, throughput, power, mem, fan_rpm)` — rolling window; keep last ~120 ticks/node.
- `events(id pk, ts, type, node_id, message)` — event log.
- `proposals(id pk, ts, node_id, diagnosis, proposed_action, target_nodes jsonb, expected_effect, confidence, risk_flags jsonb, llm_provider, zerog_inference_valid bool, zerog_root text)`
- `verdicts(id pk, proposal_id fk, verdict, detail, violated jsonb, projected jsonb, ts)`
- `commits(id pk, proposal_id fk, applied_action, zerog_root, sui_tx_digest, sui_object_id, ts)`
- `human_gates(id pk, proposal_id fk, status, world_id_nullifier, chosen_action, ts)`  -- status: pending|authorized

**Realtime:** enable on `nodes`, `events`, `proposals`, `verdicts`, `human_gates`.
**RLS (hackathon‑simple):** anon = read‑only; writes only via **service key** (B's agent). `-- TODO prod: tighten RLS`. Don't gold‑plate.

### 6.3 What A subscribes to → what renders
| Table | Drives |
|---|---|
| `nodes` | 3D mesh colors/pulse, node inspector |
| `telemetry` | mini sparklines in inspector |
| `events` | scrolling event log |
| `proposals` + `verdicts` | live reasoning trace panel (incl. `violated`/`projected`) |
| `human_gates` (status=pending) | the **freeze modal** trigger |
| `commits` | the "audit" links (Sui digest, 0G root) |

---

## 7. Realistic simulation & the verifier (the technical heart)

This is where Technicality points live and the answer to *"why not a for‑loop?"* Two owners: **B** builds the simulator (`packages/sim`), **C** builds the verifier + invariant spec (`packages/verifier`, `packages/shared/invariants.ts`). Both import the **same** frozen `physics.ts`.

### 7.1 The physics (`packages/shared/physics.ts` — co‑authored B+C, then frozen)
A pure function `step(state, controls) → nextState` with **no randomness inside** (noise is added by the sim around it). Coupled difference equations per tick `dt` (~1–2s):
- **Load** `L` — diurnal demand curve + **redistribution**: when a neighbor is `isolated`/`offline`, its load is pushed to topological neighbors by `edge.weight`. This coupling is what makes isolation dangerous.
- **Temperature** `T` — Newton cooling + heating: `T += dt * (a*L + b*P − c*(T − T_ambient))` → thermal **inertia/lag** (temp trails load, like real silicon).
- **Throttling** — if `T > T_warn`, effective capacity drops → **throughput falls even as load stays high** (the demo's ambiguous signature).
- **Throughput** `X = X_nominal * L * throttle(T)`. **Power** `P = f(L, fanRpm)`. **Fan** ramps with `T`.

The **simulator (B)** wraps `step` with **Ornstein–Uhlenbeck** (mean‑reverting) noise per metric + injected spikes + `offline` failure events, and writes to Supabase. The **verifier (C)** calls the identical `step` with **noise = 0** for its projection. Seedable RNG in the sim → reproducible demo.

### 7.2 The blueprint (`packages/shared/genio_blueprint.json`) — B authors numbers, C reviews bounds
```jsonc
{
  "nodes": [ { "id": "node-01", "pos": [x,y,z], "T_warn": 70, "T_max": 85, "L_max": 0.92,
               "X_nominal": 1000, "thermal": { "a": 8, "b": 0.01, "c": 0.15, "T_ambient": 22 } } /* ... */ ],
  "edges": [ { "from": "node-07", "to": "node-12", "weight": 0.6 } /* dependency graph */ ],
  "detection": { "temp_warn_delta": 5, "throughput_drop_pct": 0.2, "load_high": 0.85 }
}
```

### 7.3 The safety invariants (`packages/shared/invariants.ts` — ★ C)
C writes the envelope down explicitly — the spec the verifier enforces and the property tests check:
```
INV-1 (thermal): ∀ node n, ∀ tick t≤H:  T(n,t) ≤ T_max(n)
INV-2 (load):    ∀ node n, ∀ tick t≤H:  L(n,t) ≤ L_max(n)
INV-3 (liveness): the action does not drive any healthy node to offline within H
SOUNDNESS GOAL: verify_constraints(state, action)=VERIFIED  ⇒  INV-1..3 hold over horizon H (under the deterministic model)
```
This turns `genio_blueprint.json` into a real spec and is C's answer to "how do you know it's safe?" — stated, not hand‑waved.

### 7.4 Deterministic detection (rules — NOT the LLM; lives in B's loop)
Per tick, flag an anomaly if any: `T > T_warn`, `L > load_high`, `dX/dt` drop > `throughput_drop_pct`, or a neighbor `offline` within N ticks. **Detection is rules; only diagnosis+strategy is the LLM.** When flagged → assemble the LLM context window.

### 7.5 The verifier — `verify_constraints(state, action)` (★ C)
1. Deep‑copy `state`.
2. Apply the action's **effect model** deterministically:
   - `ISOLATE_NODE(j)`: `L_j→0`, status→isolated, redistribute `L_j` to neighbors by weight.
   - `SCALE_UP`: add headroom (raise effective `L_max` / add a virtual capacity node) → lowers utilization.
   - `THROTTLE_NODE(j)`: cap `L_j` at threshold (temp down, throughput down).
   - `REBALANCE_LOAD`: shift load hot→cool within capacity.
   - `NO_OP` / `ESCALATE_TO_HUMAN`: no state change / force gate.
3. Roll forward **H ticks via `step`, noise=0**.
4. Check INV‑1..3. Breach → `VIOLATION_TRIGGERED` (+ `violated` node/metric/bound). Low confidence / emergency already crossed → `ESCALATE`. Else `VERIFIED`.
5. Return `projected` per‑node metrics for the UI's **what‑if** ("isolating 07 → node‑12 hits 91°C > 85°C").

This is what makes the demo resolve: `ISOLATE` alone → VIOLATION; `SCALE_UP` first raises headroom → `ISOLATE` → VERIFIED.

### 7.6 Scenarios (`packages/shared/scenarios.ts` — ★ C defines, B's sim consumes)
Scripted, seeded injections. C owns the *definitions + expected verdicts* (also feeds C's acceptance tests); B's sim reads them to inject:
- `nominal` — calm baseline.
- `ambiguous_cascade` — **the money scenario**: `node-07` temp ramps + throughput sags **and** `node-12` goes offline ~2 ticks later. Rules can't classify → LLM decides → verifier rejects `ISOLATE` → freeze → human picks `SCALE_UP`+`ISOLATE`. **Expected:** `ISOLATE`→VIOLATION, `SCALE_UP`→VERIFIED, `SCALE_UP`‑then‑`ISOLATE`→VERIFIED.
- `benign_spike` — looks similar but verifier VERIFIES a simple `THROTTLE` (proves it isn't always‑freeze).
Expose a control (keypress / hidden dev button) for B to fire `ambiguous_cascade` on cue.

---

## 8. Stream A — Frontend/3D task list (owner: A)

Work against `supabase/seed.ts` + `mockLoop.ts` from H1. Target: demo‑ready even if B/C are late.

**A0 · Setup (H0–H2)** — Next.js App Router, HeroUI v3 + Tailwind v4 (invoke `heroui-react`), dark theme tokens, layout shell (left: 3D canvas hero; right: trace/inspector rail; top: status bar). Supabase client + `useRealtime` hook → zustand.

**A1 · The 3D mesh hero (H2–H10)** — the WOW centerpiece:
- `<Instances>` (drei) for nodes from `nodes.pos`. Status → material (muted palette: healthy = desaturated green/teal, warning = amber, violation = restrained red, awaiting_human = violet‑grey, isolated/offline = dimmed). **No neon.**
- Dependency edges via `QuadraticBezierLine`/`Line`; subtle animated flow on active edges.
- Camera: `OrbitControls`, gentle idle auto‑rotate; click node → focus + inspector.
- Motion: pulse warning/violation nodes; smooth color transitions (don't snap).
- Perf (invoke `r3f-best-practices`): instancing, memoized geometry/material, low draw calls. 60fps on a laptop.

**A2 · Postprocessing (H10–H12)** — `@react-three/postprocessing`: **subtle** `Bloom`, light `Vignette`, optional `DepthOfField` on the focused node. Tune with `leva`, then hardcode + remove leva for the demo build.

**A3 · Dashboard panels (H12–H20)** — HeroUI + Framer Motion: reasoning trace (diagnosis, action, confidence meter, risk flags, VERIFIED/VIOLATION badge); node inspector (metrics + sparklines, overlay the verifier's `projected` "→ 91°C ✗"); event log; action menu; status bar (Autonomous / **FROZEN**).

**A4 · The freeze moment (H20–H26)** — the emotional peak. On `human_gates` → `pending`: UI shifts to restrained alert state, mesh dims except the offending node; **"⚠ Emergency Human Intervention Required"** modal shows the rejected action + *why* (verdict `detail` + `violated`); **World ID button** (`IDKitWidget`) → POST proof to B's `/api/worldid/verify` → reveal safe‑action chooser → POST chosen action → UI unfreezes as `commits` arrives. Wire against a mocked endpoint until B's is live.

**A5 · Audit + polish (H26–H34)** — click a decision → drawer with 0G root, `zerog_inference_valid` badge, Sui tx digest (Sui explorer link). Empty/loading/error states. Test on the demo/projector resolution. Final polish pass (`polish`/`animate`). **Lock the visual by H34.**

---

## 9. Stream B — Backend/web3 task list (owner: B)  *(verifier removed → offloaded to C)*

**B0 · Seeds + contracts (H0–H2, with A & C)** — co‑author §6 contracts + the `verify_constraints` signature; pair with C on `physics.ts`. Then write `supabase/seed.ts` (rich frame incl. a sample freeze) + `mockLoop.ts` so A is unblocked immediately, and **stub `verify_constraints`** so B's loop can be built before C's real one lands.

**B1 · Simulator (H2–H8)** — `packages/sim`: wrap frozen `physics.ts` with OU noise + spikes + `offline` events + scenario injection (from C's `scenarios.ts`); tick loop writing `telemetry`/`nodes`/`events` to Supabase. Get the mesh **living** end‑to‑end with A ASAP.

**B2 · Sui spike + go/no‑go (H4–H10, INTERLEAVED — start early!)** — *highest risk, no Move experience.*
- Sui CLI on **testnet**, faucet funds.
- Minimal Move package `move/verimesh`: `Node` object (`has key`) with `id/status/load/temp`; `entry fun commit_transition(...)`; `init` mints one object per grid node.
- Publish; call the entry fn from CLI, then from `@mysten/sui` (`Transaction`, `Ed25519Keypair`) in `packages/chain`.
- **GO/NO‑GO at H10:** if a TS‑driven object transition isn't landing on testnet → **cut Sui to a thin stub** (digest `null`, keep the Move package as artifact + story) and reallocate. *(Mentor if stuck >30 min.)* *(If C has Move skill, C can pair here — see §11‑C stretch.)*

**B3 · 0G Compute inference adapter (H8–H14)** — `packages/chain`:
- `@0gfoundation/0g-compute-ts-sdk` broker: fund ledger, discover provider/model, get OpenAI‑compatible endpoint.
- `proposeAction(context) → Proposal` via **OpenAI SDK**. Context = telemetry window (node + neighbors) + topology + event log + action menu + blueprint bounds. Enforce JSON; **zod‑validate + retry ≤2**.
- `processResponse` → store validity attestation as `zerog_inference_valid` (the "sealed/verifiable inference" story).
- **Fallback adapter:** `provider = 'zerog' | 'openai' | 'anthropic'` behind an env flag. Primary stays 0G; fallback is booth insurance.

**B4 · 0G Storage audit (H14–H18)** — `@0glabs/0g-ts-sdk`: on every decision, `indexer.upload()` a JSON record `{ts, context_hash, diagnosis, proposed_action, verdict, inference_valid, chosen_by}` → store root as `zerog_root`. Node‑side upload only (server code — fine).

**B5 · World ID gate (H12–H18, INTERLEAVED — 2nd risk area)** — *no World experience:*
- Developer Portal: World ID **4.0** app → `app_id`, `rp_id`, `signing_key`; start from official **`world-id-cloud-template`**.
- API routes: `/api/worldid/sign` (`signRequest`) + `/api/worldid/verify` (`verifyCloudProof`). On verified → `human_gates.status='authorized'`, store `nullifier`. Give A the exact contract early.
- **AgentKit narrative:** the agent is a *human‑backed agent* — privileged actions (`ISOLATE_NODE` / any VIOLATION override) require proof of a unique human before executing = "differential authorization," verbatim the track. Stretch (H26+ slack): per‑human override counter.

**B6 · The loop + commit_state (H18–H26)** — `services/agent`: wire steps 1–5; **swap the verifier stub for C's `packages/verifier`** (one‑line import). On `VERIFIED` → `commit_state`: Supabase + 0G audit + Sui tx. On `VIOLATION`/low‑confidence → open `human_gates` (freeze), block until A's authorized action arrives, re‑verify → commit. **Demo beat must run headless from a script.**

**B7 · MCP server (H26–H30, cut‑able)** — `services/mcp` exposing `get_telemetry_data`, `verify_constraints`, `commit_state`; loop connects as MCP client. **If behind at H26, skip — call functions directly.**

**B8 · Harden the demo (H30–H34)** — reproducible scripted `ambiguous_cascade`; fallback flags tested; "reset to nominal"; confirm every UI‑needed row lands. **Feature‑freeze backend by H34.**

---

## 9C. Stream C — Verifier / formal / correctness task list (owner: C)

**C's north star:** make the "deterministic referee" *actually rigorous*, and own "everything works as described." **Baseline is on the critical path; stretch is opt‑in and gated.** B is the backstop (§4.6).

### Baseline (critical path — must land)
**C0 · Kickoff pairing (H0–H2, with B)** — co‑author `physics.ts`; co‑write the `verify_constraints`/`VerdictResult` contract; draft `invariants.ts` (§7.3). This session also self‑calibrates C's role (§4.6).

**C1 · Invariant spec + scenario defs (H2–H6)** — finalize `packages/shared/invariants.ts` (INV‑1..3 + soundness goal) and `packages/shared/scenarios.ts` (scenario definitions + **expected verdicts**). *These are pure‑logic artifacts — full value even if C is light on TS.*

**C2 · The verifier (H4–H10)** — `packages/verifier`: implement `verify_constraints` per §7.5 (effect models + noise‑free projection over `physics.ts` + invariant check + `violated`/`projected` output). **Unit‑test the money scenario: `ISOLATE`→VIOLATION, `SCALE_UP`→VERIFIED, `SCALE_UP`+`ISOLATE`→VERIFIED.** Hand B the real function to swap in at H8. *(If C is rusty in TS: C specs each effect model precisely, pairs with B to implement.)* **This is the demo's hinge — it must be rock‑solid.**

**C3 · Property‑based tests (H10–H16)** — `fast-check`: generate thousands of random `GridState × Proposal` and assert **soundness** (VERIFIED ⇒ INV‑1..3 hold over H) and **no false‑freeze on benign** cases. Kills the "breaks on the 4th scenario" fear. Great Q&A line: *"we fuzzed 10k states against the safety invariants."*

**C4 · Acceptance harness — "works as described" (H16–H22)** — `docs/acceptance.md` + a runnable check that maps **every pitch claim → an assertion**: isolate‑alone→VIOLATION; any VIOLATION→human gate opens; commit fires *only* on VERIFIED; 0G root resolves; Sui digest exists; freeze→World‑ID→re‑verify→commit end‑to‑end. This is C's ownership of the criteria.

**C5 · Cross‑stream QA + demo truth (H22–H34)** — once the verifier is locked, C becomes the **correctness owner across all streams**: run the full beat repeatedly; verify the UI shows what actually happened (0G root fetches back the real record; Sui digest exists on explorer; attestation flag is truthful — no fake green). Own the reproducible rehearsal + draft the judge Q&A answers (the soundness claim, the untrusted‑oracle→trusted‑checker→human‑tiebreak framing).

### Stretch (opt‑in — ONLY after C2/C3 are green and the demo runs headless; only if the skill surfaced in kickoff)
**C6 · SMT‑backed verification (`z3-solver` WASM)** — encode INV‑1..3 + effect models and have Z3 *prove* an action stays in‑envelope or return a concrete counterexample. Turns the verifier from heuristic → *proof*. Real WOW/Technicality spike almost no team can claim.
**C7 · Move Prover on the Sui module** — write `spec` blocks (`aborts_if`/`ensures`) proving on‑chain `commit_transition` preserves the node invariants. Ties formal methods directly to the Sui prize. **Verify the Prover actually works on Sui testnet during B2's spike before committing; never a dependency.**

> ⚠ **C's rat‑hole warning:** the demo needs a *correct, well‑tested* deterministic verifier — it does **not** need Z3 or the Move Prover to function. If C6/C7 are touched before C2–C4 are green, the project gets worse. Gate hard.

---

## 9D. Building without C — the fallback verifier (spec)

**Principle:** A and B depend on two *contracts*, never on C's *code* — the frozen `verify_constraints(state, action) → VerdictResult` signature (B↔C) and the `verdicts` table schema (everyone↔A). Both exist at H0, so neither A nor B is ever blocked by C's availability. **Treat C as an upgrade path, not a critical‑path dependency.**

- **A without C:** A never imports the verifier. A renders `verdicts` rows from Supabase (`verdict`, `detail`, `violated`, `projected`) and builds against the seed + `mockLoop`'s sample proposal/verdict/freeze rows. Whether those rows came from C's fuzzed verifier or B's stub is invisible to A.
- **B without C:** B builds the whole loop against the stub from H0, then swaps in C's real function at H8 — *or keeps the fallback below if C isn't delivering.* B is equipped to build the fallback because B co‑owns `physics.ts`.
- **Decision gate:** H6 = verifier ambiguous test green; H8 = swap into the loop. By H8–H10 you know whether to lean on C's rigor or ship B's fallback — with time to react.
- **Cost of the fallback:** you lose the rigor layer (property‑fuzzing, the soundness claim, formal QA, the "we proved/fuzzed it" answers). You keep a correct, functioning verifier and a complete demo.

### The fallback verifier — concrete spec (B can build in ~1–2h)

`packages/verifier/index.ts` — a pure function over the frozen `physics.ts` + blueprint. Same algorithm §7.5 specifies:

```ts
import { step } from '@verimesh/shared/physics';         // co-owned, frozen
import blueprint from '@verimesh/shared/genio_blueprint.json';
import type { GridState, Proposal, VerdictResult } from '@verimesh/shared/types';

const H = 10;              // projection horizon (ticks)
const CONF_MIN = 0.55;     // below this → escalate to human

export function verify_constraints(state: GridState, action: Proposal): VerdictResult {
  if (action.proposed_action === 'ESCALATE_TO_HUMAN') return escalate('agent requested human');
  if (action.confidence < CONF_MIN)                    return escalate('low confidence');

  // 1) apply the action's deterministic effect to a copy
  let s: GridState = structuredClone(state);
  applyEffect(s, action);

  // 2) project forward H ticks with noise OFF (identical model to the sim)
  const trajectory: GridState[] = [];
  for (let t = 0; t < H; t++) { s = step(s, { noise: 0 }); trajectory.push(s); }

  // 3) check hard bounds across the whole trajectory
  for (const frame of trajectory) {
    for (const n of frame.nodes) {
      const bp = blueprint.nodes.find(b => b.id === n.id)!;
      if (n.metrics.temp > bp.T_max) return violation(n.id, 'temp', n.metrics.temp, bp.T_max, trajectory);
      if (n.metrics.load > bp.L_max) return violation(n.id, 'load', n.metrics.load, bp.L_max, trajectory);
    }
  }
  return { verdict: 'VERIFIED', detail: `in-envelope over ${H} ticks`, projected: lastFrame(trajectory) };
}
```

`applyEffect(s, action)` — the only genuinely new logic B must write (the action‑effect models):

| Action | Effect on the state copy |
|---|---|
| `ISOLATE_NODE(j)` | `L_j = 0`, `status='isolated'`; redistribute `L_j` to neighbors by `edge.weight` (the same rule `physics.ts` uses for offline nodes) |
| `SCALE_UP(targets)` | add headroom: lower effective utilization on targets (e.g. `L *= 0.7`, or raise their working `L_max`) to model provisioned capacity |
| `THROTTLE_NODE(j)` | `L_j = min(L_j, throttle_cap)` |
| `REBALANCE_LOAD(j)` | move load from the hottest target to its coolest neighbor, capped at that neighbor's `L_max` |
| `NO_OP` | no change |

Helpers: `violation(node, metric, value, bound, traj)` returns a `VIOLATION_TRIGGERED` with `violated` + `projected: lastFrame(traj)`; `escalate(msg)` returns `ESCALATE`; `lastFrame(traj)` maps the final frame to `Record<nodeId, NodeMetrics>` for the UI's what‑if.

**Why this is correct enough:** it's the exact shape §7.5 specifies — clone → apply effect → project via the shared model → check bounds. C's version adds property tests, metamorphic checks, and (stretch) an SMT proof *on top of this same function*. So B's fallback and C's rigorous version are one function at two assurance levels — swapping is safe and building the fallback is never wasted work.

---

## 9E. Live device node — a real phone as a DePIN node (Termux) *(demo amplifier, optional)*

**What it buys you:** one node in the mesh is a *real physical device* — a Samsung Galaxy S22 — reporting its live CPU load + battery temperature straight to Supabase over its own cellular data. It kills the "it's just a simulation" objection, embodies the thesis literally (an **independent DePIN node reporting to the network**, not proxied through your laptop), and — because the phone, not the render laptop, is under load — it **cannot make the 3D demo laggy.** Assign it to its own operator (e.g. **Operator C**) so it reinforces the multi-operator story from §1C.

**Build it LAST** (post-H26, in the polish window). It's cuttable and the scripted beat never depends on it.

### Data flow
- **S22 (Termux, cellular)** reads `/proc/stat` (CPU) + `termux-battery-status` (real battery temp) → **POSTs to Supabase REST** as a `telemetry` row for the real node (`source:'real'`).
- **Agent loop:** for the real node it **reads the latest Supabase row instead of simming**; if that row is stale (> ~6s) or missing → **falls back to simming that node** (graceful — a dropout never breaks the demo).
- **Frontend:** renders the node like any other, with a **"● LIVE — Galaxy S22"** badge (keyed off `source:'real'`).

The phone is a **producer to Supabase**; the agent is a **consumer**. Ownership split avoids write contention: **the phone owns the node's metrics; the agent owns only its status** (healthy/warning/…). Everything downstream (detect → LLM diagnose → verify → commit) runs unchanged — a real input just flows through the existing pipeline.

### Phone setup (once, ~20 min)
1. Install **Termux** and **Termux:API** from **F-Droid** (not Play Store — that build is dead).
2. In Termux: `pkg install nodejs termux-api jq stress-ng`
3. Exempt Termux from battery optimization; run `termux-wake-lock` so Android won't kill it; keep the phone plugged in.
4. Prefer **mobile data** (independent of venue WiFi) — but **test signal at the venue**; if weak, use venue WiFi or USB-tether. The sim fallback covers dropouts regardless.

### The reporter (Termux, Node — `report.js`)
```js
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const URL = 'https://<proj>.supabase.co/rest/v1/telemetry';
const KEY = process.env.SUPA_KEY;                 // demo-scoped insert key; rotate after the event
const NODE = 'node-00';
let prev = null;
const cpu = () => {
  const p = fs.readFileSync('/proc/stat','utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = p[3]+p[4], total = p.reduce((a,b)=>a+b,0);
  const load = prev ? 1-(idle-prev.idle)/Math.max(1,total-prev.total) : 0;
  prev = { idle, total }; return load;
};
setInterval(async () => {
  const load = cpu();
  let temp; try { temp = JSON.parse(execSync('termux-battery-status')).temperature; } catch {}
  await fetch(URL, { method:'POST', headers:{ apikey:KEY, Authorization:`Bearer ${KEY}`,
    'Content-Type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify({ node_id:NODE, ts:Math.floor(Date.now()/1000), load, temp, source:'real' }) });
}, 2000);
```
Run: `SUPA_KEY=<key> node report.js`. Use a restricted RLS insert policy for `telemetry`, or accept a demo-scoped key and rotate it after the event.

### Trigger the spike on cue
On the phone: `timeout 8 stress-ng --cpu 4` — bounded and self-killing. Bind it to a **Termux:Widget** home-screen button so you *tap the phone* to make the node heat up. Crank **GAIN** on ingest so a modest real rise reads as a dramatic node spike.

### Reliability checklist
- **Graceful fallback** (agent sims the node on stale/missing data) — the single most important safeguard.
- `termux-wake-lock` + battery-optimization off + plugged in, so Termux isn't killed mid-demo.
- **Test cell signal at the venue early**; keep WiFi/USB-tether as backup routes.
- **Short bursts only** (phones throttle safely; charging + sustained load runs hot).
- Narrate precisely: *"real CPU load and real battery temperature"* — both are genuine sensors (unlike laptop CPU temp, which had to be modeled). Overclaiming loses Q&A trust.

---

## 10. Integration checkpoints & risk gates (combined timeline)

Times are **relative hours from start (H0)**; map to the calendar with **Sun 09:00 WEST as the wall**. Reserve **H34→deadline for freeze/video/submit**.

| Hour | Checkpoint | Gate / risk action |
|---|---|---|
| **H0–H2** | Both contracts frozen (types + `verify_constraints` sig), schema, `physics.ts` (paired B+C), invariants draft, seed, `mockLoop`, verifier stub. Monorepo + deploys wired. **C role self‑calibrated.** | If a contract isn't stable by H2, everything slips — prioritize. |
| **H6** | **Living mesh** (B sim → Supabase → A 3D). **Verifier ambiguous unit test green** (C: ISOLATE→VIOLATION, SCALE_UP+ISOLATE→VERIFIED). | If verifier is behind, B's stub keeps the loop moving; C + B pair to close it. |
| **H8** | B swaps stub → **C's real `verify_constraints`** in the loop. | One‑line import. |
| **H10** | **SUI GO/NO‑GO.** | Not landing via TS → cut to stub, reallocate. |
| **H14** | **0G Compute** returns a schema‑valid attested proposal. **C's property suite green.** | Broker flaky → flip fallback flag. |
| **H18** | **World ID** cloud verify end‑to‑end vs A's widget. **0G audit writing.** | Stuck on World → mentor; worst case document real path + mock proof for demo (last resort). |
| **H22** | **C's acceptance harness green.** C flips to cross‑stream QA. | — |
| **H26** | **Full demo beat runs headless** (cascade → freeze → resume → commit). | The "it works" milestone. After this: polish + resilience (+ C's opt‑in stretch). |
| **H30** | 0G audit + Sui digest visible in UI; MCP wrapped (or consciously skipped). | — |
| **H34** | **FEATURE FREEZE.** Visual + backend + verifier locked; one clean rehearsal recorded; acceptance harness passing. | No new features past here. |
| **H34→ deadline** | Demo video (2–4 min, ≥720p), README + AI attribution + acceptance doc, submit, **select World + 0G + Sui**. | Submit with **buffer** — "no late submissions." |

**Rule:** if any anchor (World, 0G) is at risk, **cut Sui and MCP first**; if C's stretch (Z3/Prover) risks the baseline, **cut the stretch first**. Two deep anchors + a rigorous verifier beat three shallow chains + an unfinished proof system.

---

## 11. Risk register

| Risk | Likelihood | Mitigation | Cut‑line |
|---|---|---|---|
| **Sui Move** (no experience) | High | Early spike H4–H10, minimal object, CLI‑first then TS. *(C pairs if Move skill surfaces.)* | H10 stub, keep Move package as artifact. |
| **World ID** (no experience) | Med‑High | Official cloud template, wire early, mentor fast. | Mock proof for demo *only if* truly stuck (loses prize edge). |
| **0G Compute** structured JSON | Med | zod + retry; OpenAI‑compat; fallback adapter. | Flip to OpenAI/Anthropic; 0G stays audit. |
| **0G broker downtime at booth** | Med | Pre‑fund ledger; test fallback flag; cache last good proposal. | Fallback provider. |
| **C ramp‑up / unknown toolkit** | Med | Paired kickoff self‑calibrates role; spec/QA deliverables need no special tooling; **B is verifier backstop**. | B carries verifier to demo‑grade; C stays on spec + acceptance + QA. |
| **C rat‑holes on Z3/Move Prover** | Med | Stretch gated behind green baseline + headless demo. | Cut stretch entirely; baseline verifier is enough. |
| **3D perf jank on projector** | Med | Instancing, demand frameloop, cap postFX; test on demo machine early. | Reduce bloom/DOF, fewer nodes. |
| **Merge conflicts / blocking** | Low (by design) | Folder‑disjoint ownership; two frozen seams; sub‑owned `shared`; frequent small commits. | — |
| **Scope creep** | High | Non‑goals (§0). One decision point only. | Say no. |
| **Submission crunch** | Med | H34 freeze; video + form before deadline with buffer. | — |

---

## 12. Demo video & submission checklist (H34→deadline)

**Video (2–4 min, ≥720p, real voice — no TTS, no phone recording; these auto‑reject):**
1. ~15s hook: autonomous agents on critical infra can't be trusted to act unsupervised.
2. Live mesh + the one‑decision agent loop (show the trace *reasoning*, not just thresholds).
3. Fire `ambiguous_cascade` → LLM proposes ISOLATE → verifier VIOLATION → **freeze**. *(If landed: mention "our verifier is SMT‑backed / we fuzzed 10k states / our Move module is formally verified.")*
4. **World ID scan** → authorize → SCALE_UP+ISOLATE → VERIFIED → mesh recovers.
5. Open the **0G audit trail** (diagnosis + attested inference + Sui digest). Close on the one‑liner (§1).

**Submission form:**
- [ ] Repo link, clean README, **AI attribution** section + this plan + `docs/acceptance.md`.
- [ ] Commit history shows incremental work (you've committed every ~30 min, on all three branches).
- [ ] Description hitting the 5 criteria (§13).
- [ ] Select **exactly 3 partner prizes: World, 0G, Sui**.
- [ ] Demo video uploaded and plays.
- [ ] Submit with buffer before **Sun 09:00 WEST**.

---

## 13. Judging‑criteria map (build toward the rubric)

| Criterion | Where Verimesh scores | Make sure to show |
|---|---|---|
| **Technicality** | Deterministic verifier with a **stated soundness property**, property‑fuzzed against explicit invariants *(+ optional SMT / Move‑Prover proof)*; 0G‑attested inference; 3 chain integrations. | The verifier's forward projection + "we proved/fuzzed it" — the "why not a for‑loop" answer. |
| **Originality** | "LLM proposes, deterministic referee disposes, verified human breaks ties" — untrusted oracle → trusted checker → human tiebreak. | The freeze→World‑ID→re‑verify loop as one necessary chain. |
| **Practicality** | Real infra‑ops use case; each piece load‑bearing; acceptance harness proves it. | End‑to‑end run with no hand‑waving. |
| **Usability (UI/UX/DX)** | Clean dark enterprise dashboard, legible 3D, dramatic freeze, MCP tools. | The freeze moment + one‑click audit trail. |
| **WOW** | 3D mesh hero + the moment automation freezes and demands a human *(+ "our referee is formally verified")*. | Rehearse the beat so it lands in <90s. |

---

## 14. Pre‑flight checklist (H0, in parallel, before coding)

**A:** Vercel project · Supabase project (URL + anon key) · Node/pnpm · confirm HeroUI v3 install path.
**B:** Supabase **service key** · World **Developer Portal** app (4.0 → app_id/rp_id/signing_key) · **0G testnet** wallet + faucet (Compute ledger + Storage + gas) · **Sui testnet** CLI + address + faucet · OpenAI/Anthropic key (fallback) · commit `.env` template (no secrets).
**C:** repo access + Node/pnpm running locally · `fast-check` installed · *(stretch, only if relevant)* `z3-solver` / Sui Move Prover toolchain. If unfamiliar with the stack, first hour is pairing with B — don't set up alone.

**Shared `.env` var names (agree up front):**
```
NEXT_PUBLIC_SUPABASE_URL=  NEXT_PUBLIC_SUPABASE_ANON_KEY=  SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_WORLDID_APP_ID=  WORLDID_RP_ID=  WORLDID_SIGNING_KEY=  WORLDID_ACTION=verimesh-authorize
ZEROG_RPC=https://evmrpc-testnet.0g.ai  ZEROG_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
ZEROG_PRIVATE_KEY=  ZEROG_COMPUTE_PROVIDER=  LLM_PROVIDER=zerog  OPENAI_API_KEY=  ANTHROPIC_API_KEY=
SUI_NETWORK=testnet  SUI_PRIVATE_KEY=  SUI_PACKAGE_ID=
```

---

## 15. First 2 hours — literal starting moves

**All three (H0–H1):**
1. `pnpm` workspace + folders (§3). Commit the skeleton.
2. Write `packages/shared/types.ts` + `ProposalSchema` + freeze the **`verify_constraints` signature** (§6.1).
3. Write `supabase/migrations/0001_init.sql` (§6.2), apply it, enable realtime.
4. Write `packages/shared/genio_blueprint.json` (12–16 node grid + edges).

**Then (H1–H2):**
- **B + C pair** on `packages/shared/physics.ts` (co‑author, then freeze) → this also self‑calibrates C's role (§4.6).
- **B:** `supabase/seed.ts` + `mockLoop.ts` + **stub `verify_constraints`**. Push. Tell A "seed is live," tell C "stub is in — swap at H8."
- **C:** start `invariants.ts` + `scenarios.ts` (pure‑logic, no blocker).
- **A:** Next.js + HeroUI dark shell + Supabase realtime hook rendering seeded `nodes`. Push.

By **H2**: a deployed shell reading seeded data, two frozen seams, a paired‑and‑frozen physics model, and **three disjoint lanes**. From here you rarely block each other until integration checkpoints.

---

### Appendix — sources checked while writing this plan
- World ID / IDKit + cloud verify + AgentKit: [IDKit docs](https://docs.world.org/world-id/idkit/integrate), [world-id-cloud-template](https://github.com/worldcoin/world-id-cloud-template), [AgentKit coverage](https://coincodex.com/article/83040/world-introduces-agentkit-to-link-ai-agents-with-verified-human-identity)
- 0G Compute: [Inference SDK docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/sdk), [0g-compute-ts-sdk](https://github.com/0gfoundation/0g-compute-ts-sdk), [starter kit](https://github.com/0glabs/0g-compute-ts-starter-kit)
- 0G Storage: [Storage SDK docs](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk), [@0glabs/0g-ts-sdk](https://www.npmjs.com/package/@0glabs/0g-ts-sdk)
- Sui: [Publish a Package](https://docs.sui.io/guides/developer/first-app/publish), [@mysten/sui SDK](https://sdk.mystenlabs.com/typescript); Move Prover (formal verification for Move `spec` blocks)
- Verifier testing: [fast-check](https://github.com/dubzzz/fast-check) (property‑based testing for TS); optional [z3-solver](https://www.npmjs.com/package/z3-solver) (Z3 WASM)
