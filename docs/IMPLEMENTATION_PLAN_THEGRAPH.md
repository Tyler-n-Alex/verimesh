# Verimesh — Implementation Plan · **Variant C (The Graph — agent memory)**

> **This is the The Graph variant.** It's a fork of the base plan [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (physical‑only, no economics). Same **World** (human gate) + **0G** (Compute + Storage) anchors, same 3‑person structure, same simulation/verifier — but the **third track is The Graph**, and Verimesh gains a **trustless, queryable memory**: every verified decision is committed on‑chain (0G Chain) and indexed by a **subgraph** the agent itself queries before diagnosing. Read the base plan's §4 (Collaboration), §7 (simulation/verifier), §9D (building without C), §9E (live device node) first — they're unchanged. **◈ = differs from the base plan.**

> **Event:** ETHGlobal Lisbon 2026 · **Hard deadline:** Sun **July 26, 09:00 WEST**.
> **Track:** Classic "Start Fresh" — all code during the event, incremental commits.
> **Partner prizes (max 3):** **World**, **0G**, **◈ The Graph**.
> **Judging:** Technicality · Originality · Practicality · Usability (UI/UX/DX) · WOW Factor.

---

## 0. Locked decisions (◈ deltas)

| Decision | Choice | Consequence |
|---|---|---|
| ◈ Third track | **The Graph** — a custom **subgraph** indexing an on‑chain decision registry | No payments/economics. Verifier is **physical‑only** again (simpler C lane). |
| ◈ On‑chain source | A minimal **EVM registry contract on 0G Chain** emits one event per verified decision | The Graph needs an on‑chain write source; 0G Chain is EVM, so it stays in the 0G ecosystem. |
| ◈ Query path | The agent queries history via **The Graph's Subgraph MCP server** (`get_history` tool) | Fits the existing MCP architecture; hits The Graph's AI‑agent narrative head‑on. |
| ◈ Data roles | Supabase = hot state · **0G Chain registry + The Graph = trustless queryable history** · 0G Storage = immutable blobs | Three non‑overlapping roles. The Graph fills the "queryable" gap 0G Storage can't. |
| World | **Still the human gate + a submitted track** (AgentKit / human‑backed agent) | Functionally load‑bearing; The Graph is the *strong* third track on top. |
| 0G depth | **0G Compute inference from the start** + **0G Storage** audit blobs | Unchanged from base plan. |
| Removed vs Hedera variant | economics, balances, settlements, `budget_breach`, HTS, Hedera Agent Kit | Cleaner scope; new toolchain (subgraph) is the trade. |

**◈ Scope discipline (critical):** the LLM still makes **exactly one** decision — pick one action from the fixed menu. The Graph makes that decision *better‑informed* (history context), not *more numerous*. The `get_history` query is **context assembly**, not a second LLM decision.

**Non‑goals (unchanged):** grid‑wide optimization, multi‑decision agents, real hardware, mobile, auth/multi‑tenant, prod RLS, >1 LLM decision. **◈ Also non‑goal:** don't build a token/knowledge‑graph economy — one custom subgraph as trustless memory is the whole Graph story.

---

## 1. North Star & the demo beat

**◈ One sentence:** *An autonomous agent manages a 3D mesh of DePIN infra nodes; the LLM proposes fixes, a deterministic verifier disposes, a World‑ID human breaks ties — and every decision is committed on‑chain and indexed by a **subgraph the agent itself queries as trustless memory**, so it reasons over the network's real history (not just the current tick), with full reasoning blobs written immutably to 0G.*

**◈ The demo beat (two scenarios — one physical, one *memory*):**

*Scenario 1 — the ambiguous cascade (physical safety, as base plan):*
1. Live 3D mesh, healthy; trace calm.
2. Inject on `node‑07` (opA): rising temp + falling throughput + neighbor `node‑12` (opB) offline.
3. Agent calls **`get_history(node‑07)` via The Graph MCP** → "no prior incidents" → LLM diagnoses → proposes `ISOLATE_NODE`.
4. Verifier simulates → isolating 07 overloads 12 past thermal limit → **VIOLATION** → freeze.
5. **World ID scan** → authorize → `SCALE_UP` then `ISOLATE` → VERIFIED → commit: **◈ on‑chain registry event fires on 0G Chain**, subgraph indexes it, 0G blob written, mesh recovers.

*Scenario 2 — the agent remembers (proves The Graph is load‑bearing):*
6. Later, inject the *same signature* on `node‑09` (opA).
7. Agent calls **`get_history` on The Graph** → finds the earlier `node‑07` incident + its resolution → the trace shows the cited history → LLM proposes the **historically‑safe** `SCALE_UP`‑then‑`ISOLATE` directly (or escalates a repeat‑offender node), skipping the cascade.
8. Click any decision → **audit drawer queries The Graph (GraphQL)**: the full trustless history of what the AI did, per operator, with 0G blob + on‑chain tx links. Any operator can run the same query — no central API to trust.

**◈ Why this wins the Graph track:** the subgraph isn't a decorative event log — the **agent's own decision quality depends on querying it**, and it's the operators' shared trustless audit layer. That's the "why not a for‑loop" bar, applied to memory: the agent reasons over decentralized history no one can forge.

---

## 1B. Product thesis & positioning (◈ deltas)

Same DePIN framing as the base plan §1B (say it at the booth), with The Graph swapped for the payments angle:

**Why the crypto is load‑bearing (trustlessness between untrusting operators):**
- **World** — proves a *real, unique human* authorized a privileged override.
- **0G** — attested inference + a tamper‑proof audit blob *no single operator can forge*.
- **◈ The Graph** — the shared, **queryable** memory of everything the AI did. Any operator runs GraphQL over the decentralized index — "every VIOLATION on my nodes," "every action operator B took" — **without trusting the central Supabase**, and the *agent itself* consults it to make history‑aware decisions.

**◈ The "why does this need a blockchain?" kill‑shot (rehearse):** *"Because independent operators don't trust each other, the central API, or the AI. 0G makes the record un‑forgeable; The Graph makes it independently queryable by anyone; World proves a real human authorized the exceptions. Remove them and a multi‑party network can't trust an AI's account of what it did — or reason over it. Our agent literally queries that trustless memory before it acts."*

**◈ Sim → real is one adapter** (unchanged): swap the simulator for a Prometheus/IoT feed; the identical agent + verifier + human‑gate + **on‑chain commit + subgraph** stack runs on live infra.

---

## 1C. DePIN reinforcements (◈ deltas)

Identical keystone to base plan §1C — the **`operator` dimension** is baked into the H0 contract. ◈ Changes to the reinforcement table:
- **Drop** the "cross‑operator settlements" row (no payments).
- **◈ Add — per‑operator history views:** the registry event carries `operator`, so the subgraph serves per‑operator queries; the audit view lets an operator see (and dispute) exactly what the AI did to *their* nodes, indexed trustlessly.
- **◈ Add — "the agent cited this" panel:** surface the `get_history` result the agent used, so judges *see* the memory being consulted (not just claimed).
- Keep operator‑aware 3D, cross‑operator freeze, DePIN‑native telemetry labels, swappable telemetry source.

---

## 2. Architecture at a glance

| Tier | What runs there | Owner | How it connects |
|---|---|---|---|
| **Frontend** — Next.js + R3F | 3D mesh, reasoning trace, event log, node inspector, action menu, **◈ history/audit views (GraphQL)**, freeze modal, World ID widget | **A** | Subscribes to Supabase (realtime); queries **The Graph** (GraphQL) for history; calls B's `/api/worldid/*`. |
| **Supabase** — Postgres + Realtime *(the seam)* | `nodes`, `edges`, `telemetry`, `events`, `proposals`, `verdicts`, `commits`, `human_gates` | **shared contract** | B writes (service key); A subscribes (anon). |
| **Agent service** — Node loop | the 6‑step loop below; imports the verifier | **B** (verifier by **C**) | Reads the simulator; **◈ queries The Graph via MCP**; writes Supabase + chains. |
| **Chains / data** | **0G Compute** (attested inference) · **0G Storage** (audit blobs) · **◈ 0G Chain registry** (decision events) · **◈ The Graph** (subgraph indexing the registry) | **B** | Registry event on each commit; subgraph indexes; agent + UI query GraphQL. |

**◈ The agent loop (Stream B), step by step:**
1. `get_telemetry_data()` — latest simulator window.
2. **detect anomaly** — deterministic rules (no LLM).
3. **◈ `get_history(nodeId, operator)`** — query The Graph (Subgraph MCP) for this node's / operator's prior incidents + outcomes.
4. **diagnose + propose** — the *one* LLM decision, via **0G Compute**, with telemetry **+ the retrieved history** in context.
5. `verify_constraints()` — **C's** deterministic projection → `VERIFIED` / `VIOLATION` / `ESCALATE`.
6. `commit_state()` — on **VERIFIED**: state → Supabase, blob → 0G Storage, **◈ event → 0G Chain registry** (then subgraph indexes it). On **VIOLATION / low confidence** → **freeze** → **World ID** → re‑verify → commit.

**End‑to‑end:** Simulator → Supabase → [ detect → **◈ get_history** → LLM propose → verify → commit + **◈ on‑chain event** ] → subgraph indexes → agent/UI query GraphQL.

**◈ Role separation:** Supabase = hot operational state (live loop + 3D) · 0G Storage = immutable full reasoning blobs · **0G Chain registry + The Graph = trustless, queryable history/memory.** The Graph is history, **not** the live path (indexing lag is fine).

---

## 3. Repo structure & ownership (◈ deltas from base plan)

```
verimesh/
├─ apps/web/                    # ▲ A — + ◈ GraphQL history/audit views (replaces balances UI)
├─ services/agent/  services/mcp/   # ● B — ◈ mcp also wires The Graph Subgraph MCP (get_history)
├─ packages/
│  ├─ shared/                   # ◆ CONTRACT
│  │   ├─ types.ts              #   ◈ DecisionRecord + HistoryEntry; NO EconomicState/Settlement
│  │   ├─ physics.ts            #   co-authored B+C, frozen (unchanged)
│  │   ├─ genio_blueprint.json  #   node params + topology (no economic policy)
│  │   ├─ invariants.ts         #   ★ C — physical invariants only
│  │   └─ scenarios.ts          #   ★ C — ambiguous_cascade + ◈ recurring_fault + benign_spike
│  ├─ sim/                      # ● B
│  ├─ verifier/                 # ★ C — physical checks only
│  └─ chain/                    # ● B — 0G storage/compute + ◈ 0G Chain registry client + Graph query client
├─ contracts/                   # ◈ NEW — Solidity registry (Hardhat/Foundry), deployed to 0G Chain
├─ subgraph/                    # ◈ NEW — subgraph.yaml + schema.graphql + AssemblyScript mappings
├─ supabase/                    # ◆ CONTRACT — no balances/settlements; commits gets chain_tx_hash
└─ docs/
```
**◈ Removed:** `packages/economics`, balances/settlements, any Sui/Hedera dirs. **◈ Added:** `contracts/` (registry), `subgraph/`.

**◈ How the Graph work splits (so B isn't buried):** **A** owns the GraphQL history/audit UI, **B** owns the registry contract + subgraph deploy + `get_history` wiring, **C** owns verifying that the subgraph's answers match what was committed (part of the acceptance harness).

---

## 4. Collaboration protocol (◈ deltas)

**Identical to base plan §4.** ◈ One addition: a **third frozen artifact at kickoff — the `DecisionRecord` shape**, which is simultaneously (a) the on‑chain registry event fields, (b) the subgraph `schema.graphql` entity, and (c) what `get_history` returns. Freeze it once (B authors, A + C consume) so the contract event, the subgraph, and every query agree. Treat it like the schema seam.

---

## 5. Tech stack (◈ deltas only; rest = base plan §5)

| Layer | ◈ Change |
|---|---|
| On‑chain registry | **Solidity** registry contract on **0G Chain** (EVM), via Hardhat or Foundry; **viem/ethers** client. |
| Indexing | **The Graph** — `@graphprotocol/graph-cli`, a subgraph (`subgraph.yaml` + `schema.graphql` + AssemblyScript mappings). Deploy via **local `graph-node` (docker‑compose)** pointed at 0G Chain RPC, or **Subgraph Studio** if 0G Chain is supported. |
| Agent memory | **The Graph Subgraph MCP server** wired as a `get_history` tool for the agent; **GraphQL** direct for the frontend history views. |
| Verifier | **physical‑only** (pure TS + `fast-check`). No economic pass. |
| Removed | `@mysten/sui`, Move, Hedera/`@hashgraph/sdk`, `packages/economics`. |

Everything else — Next.js, HeroUI v3, R3F/drei/postprocessing, Framer Motion, zustand, Supabase, 0G Compute + 0G Storage, World ID IDKit, MCP — **unchanged**.

---

## 6. Shared contracts (◈ deltas)

### 6.1 Types (`packages/shared/types.ts`) — ◈ additions/removals
```ts
export type GridState = { nodes: GridNode[]; edges: Edge[] };   // ◈ no economy

export interface VerdictResult {
  verdict: "VERIFIED" | "VIOLATION_TRIGGERED" | "ESCALATE";
  detail: string;
  violated?: { node: string; metric: string; value: number; bound: number };  // ◈ no kind
  projected: Record<string, NodeMetrics>;
}

export interface DecisionRecord {          // ◈ the on-chain event == subgraph entity == get_history row
  id: string;
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  humanAuthorized: boolean;
  worldIdNullifier?: string;
  zerogRoot?: string;
  chainTxHash?: string;
  ts: number;
}

export interface HistoryEntry {            // ◈ what get_history returns to the agent
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  outcome: string;
  ts: number;
}
```

### 6.2 The registry contract (`contracts/`, on 0G Chain) — ◈ events the subgraph indexes
```solidity
event Committed(bytes32 indexed id, string nodeId, string operator, string action, string verdict, bytes32 zerogRoot, uint256 ts);
event Frozen(bytes32 indexed id, string nodeId, string operator, string reason, uint256 ts);
event HumanOverride(bytes32 indexed id, bytes32 worldIdNullifier, string chosenAction, uint256 ts);
```
Minimal: functions just `emit` (optionally store the latest state per node). The events are the whole point — they feed The Graph.

### 6.3 Subgraph (`subgraph/schema.graphql`) — ◈ the queryable entities
`Decision`, `Freeze`, `Override`, `NodeHistory`, `Operator` — indexed from the events above, queryable by `nodeId`, `operator`, `verdict`, time range. This is the agent's memory and the operators' audit surface.

### 6.4 Supabase schema — ◈ deltas
- **Remove** `balances`, `settlements`. **Add** `commits.chain_tx_hash` (0G Chain tx) alongside `zerog_root`. Everything else = base plan.

---

## 7. Simulation & verifier (◈ deltas)

Physics (`physics.ts`), blueprint, detection, and the verifier are **physical‑only, identical to the base plan §7** (no economic pass). ◈ Scenario changes (`scenarios.ts`, ★ C):
- `ambiguous_cascade` — as base plan.
- **◈ `recurring_fault`** — re‑injects the same signature on a different node so `get_history` surfaces the prior incident and changes/justifies the decision. **This is the memory beat; it's what proves The Graph load‑bearing.**
- `benign_spike` — verifies a simple THROTTLE.

---

## 8. Stream A — Frontend/3D (◈ deltas)

Same as base plan §8 (A0–A5), with the economics UI replaced by **The Graph views:**
- **◈ A3.5 · History / audit views (GraphQL) (H16–H22)** — a **per‑operator decision history** (query the subgraph), an **incident timeline**, and the **"the agent cited this" panel** in the trace showing the `get_history` result the LLM used. Use a lightweight GraphQL client (or `fetch`) against the subgraph endpoint.
- **◈ A5** audit drawer: for any decision, run a live GraphQL query to The Graph → show the trustless indexed record + 0G blob + 0G Chain tx (explorer link). Frame it as "any operator can run this exact query."

---

## 9. Stream B — Backend/web3 (◈ deltas)

Same as base plan §9 (B0 seed, B1 simulator, B3 0G Compute, B4 0G Storage, B5 World ID, B6 loop, B7 MCP, B8 harden), with the third‑chain spike replaced:

**◈ B2 · Registry + subgraph spike + go/no‑go (H4–H10, start early).** *New toolchain — your main risk.*
- Deploy a minimal **Solidity registry** to **0G Chain** testnet (Hardhat/Foundry; you know EVM via 0G). Emit `Committed` once from a script.
- Stand up a **subgraph** indexing it: `graph init` → `schema.graphql` + mappings → deploy via **local `graph-node` (docker‑compose)** against 0G Chain RPC (needs docker + IPFS + Postgres), or Subgraph Studio if 0G Chain is supported. Query it in GraphiQL.
- Wire the **Subgraph MCP server** so the agent can call `get_history`.
- **GO/NO‑GO at H10:** if a subgraph won't index 0G Chain → deploy the registry on a Graph‑native testnet (Sepolia/Arbitrum Sepolia) instead, or fall back to local `graph-node`. Worst case: mirror history in Supabase and keep the subgraph as a read‑only proof. *(Mentor if stuck >30 min.)*

**◈ B6 · commit_state** now also emits the **0G Chain registry event** (store `chain_tx_hash`) in addition to Supabase + 0G Storage. **◈ Add `get_history`** to step 3 of the loop via the Graph MCP; feed its result into the diagnose context.

**World ID** — unchanged from base plan (still the human gate; the override is recorded as a `HumanOverride` event too, so it's queryable).

---

## 9C. Stream C — Verifier / formal / correctness (◈ deltas)

Same as base plan §9C, **simpler** (physical‑only — no economic invariants). ◈ One added QA responsibility:
- **◈ Subgraph‑truth check** in the acceptance harness: every decision committed on‑chain must appear in a `get_history` / GraphQL query with matching fields (what the agent "remembers" == what actually happened). This is a natural fit for C's correctness role and protects the memory beat.

## 9D. Building without C (◈ deltas)
Identical to base plan §9D — the fallback verifier is **physical‑only** (no economic pass to port), so it's the plain base spec. B backstops.

## 9E. Live device node (Termux) (◈ pointer)
Use base plan §9E as‑is. ◈ The S22's decisions are committed on‑chain and indexed too, so the real device's history is queryable via The Graph like any node — a real physical node with a trustless, queryable record.

---

## 10. Timeline (◈ deltas from base plan §10)

| Hour | ◈ Change |
|---|---|
| **H0–H2** | + freeze the **`DecisionRecord`** shape (event ↔ subgraph schema ↔ get_history). |
| **H6** | Verifier ambiguous test green. **◈ Trivial registry + subgraph indexing a seeded event** end‑to‑end. |
| **H10** | **◈ THE GRAPH GO/NO‑GO** (subgraph indexes a 0G Chain commit; `get_history` returns it). |
| **H14** | Property suite green. **◈ `get_history` wired into the loop** (diagnosis sees history). |
| **H18** | World ID end‑to‑end. **◈ commit_state emits registry events; subgraph indexes live commits.** |
| **H22** | Acceptance harness green **incl. ◈ subgraph‑truth check**; A's history/audit views live. |
| **H26** | **◈ Both scenarios run headless** (ambiguous_cascade + `recurring_fault` where the agent cites history). |
| **H34** | Feature freeze; rehearse **both** beats. |

**◈ Cut order if crunched:** drop `recurring_fault` demo polish → use direct GraphQL instead of the MCP path → mirror history in Supabase + keep the subgraph read‑only. Protect: World + 0G + **a subgraph that indexes real committed decisions and answers one GraphQL query on stage**.

---

## 11. Risk register (◈ deltas)

| Risk | ◈ Change vs base plan |
|---|---|
| **Sui/Move, Hedera/economics** | **Removed** (not in this variant). |
| ◈ **The Graph subgraph toolchain** (new) | Med‑High. graph‑cli + mappings + local graph‑node/docker is the learning curve. Early spike; local graph‑node fallback; direct‑GraphQL fallback for the MCP path. |
| ◈ **0G Chain indexability by The Graph** | Med. H10 go/no‑go; fallback to a Graph‑native testnet for the registry. |
| ◈ **Indexing latency** | Low. The Graph is the *history* layer, not the live loop (Supabase owns hot state) — lag is by design, not a bug. |
| World ID, 0G Compute/broker, 3D perf, merge/blocking, scope creep, submission crunch | **Unchanged** from base plan. |

---

## 12. Demo video & submission (◈ deltas)

**Video** — physical freeze (as base plan) **+ ◈ the memory beat**: show the agent calling `get_history`, the cited prior incident in the trace, and the history‑aware decision; then run a **live GraphQL query** against the subgraph in the audit drawer. Line to land: *"the agent doesn't just check the rules — it queries a decentralized, trustless memory of everything the network has done, and so can any operator."*

**Submission** — ◈ select **World + 0G + The Graph**; in the Graph writeup name the **custom subgraph** + the **Subgraph MCP server** (agent querying indexed data); include the subgraph endpoint + a sample GraphQL query + 0G Chain tx hashes as proof.

---

## 13. Judging map (◈ deltas)

| Criterion | ◈ Change |
|---|---|
| **Technicality** | + a **memory‑augmented agent** querying a **custom subgraph via MCP**; on‑chain registry + indexing pipeline alongside the deterministic verifier. |
| **Originality** | ◈ **strong** — "an AI that queries a decentralized, trustless memory before it acts, and whose every action is independently queryable by any operator." |
| **Practicality** | + a real, queryable audit layer operators can use without trusting a central API. |
| **Usability** | + per‑operator history views + the "agent cited this" panel. |
| **WOW** | + "the agent remembers" beat + a live GraphQL query on stage over the AI's own trustless history. |

---

## 14. Pre‑flight (◈ deltas)

**B (add):** **0G Chain testnet** wallet + gas (EVM); **Hardhat or Foundry**; **`@graphprotocol/graph-cli`**; **docker** (+ IPFS + Postgres for local `graph-node`) or a **Subgraph Studio** account + deploy key; the **Subgraph MCP server** configured for the agent. **Remove** Hedera/Sui/economics items.
**◈ `.env` (swap the third‑chain block):**
```
ZEROG_CHAIN_RPC=            ZEROG_CHAIN_ID=
REGISTRY_ADDRESS=           REGISTRY_PRIVATE_KEY=
SUBGRAPH_URL=               GRAPH_MCP_ENDPOINT=
```
Everything else (Supabase, World, 0G Compute/Storage, OpenAI/Anthropic fallback) unchanged.

---

## 15. First 2 hours (◈ deltas)

Same as base plan §15, ◈ with the Graph swap:
- **All three (H0–H1):** contracts + schema (no balances/settlements) + `genio_blueprint.json` + **freeze `DecisionRecord`** (event ↔ subgraph ↔ get_history).
- **B (H1–H2):** seed + `mockLoop` + verifier stub, **plus** deploy a trivial registry to 0G Chain and a stub subgraph indexing one seeded event, so A can query GraphQL against real data immediately.
- **C:** `invariants.ts` (physical) + `scenarios.ts` (incl. `recurring_fault`).
- **A:** dark shell + realtime hook rendering seeded `nodes`, **plus** a first GraphQL query against the stub subgraph.

---

### Appendix — The Graph sources
- The Graph AI suite (MCP servers + Agent Skills; NL queries over subgraphs): [MCP + Skills announcement](https://thegraph.com/blog/querying-blockchain-data-natural-language-mcp-skills/), [AI docs](https://thegraph.com/docs/en/ai-suite/ai-introduction), [technical roadmap (A2A, x402 per‑query)](https://thegraph.com/blog/technical-roadmap/)
- Subgraph tooling: [Quick Start](https://thegraph.com/docs/en/subgraphs/quick-start/), [Subgraph Studio deploy](https://thegraph.com/docs/en/subgraphs/developing/deploying/using-subgraph-studio/), [deploy to any EVM via local graph‑node (docker)](https://medium.com/coinmonks/deploy-subgraphs-to-any-evm-aaaccc3559f)
- (World ID, 0G Compute, 0G Storage sources: see the base plan appendix.)
