**Verimesh**

**Agentic automation governed by verifiable constraints, with sharp, modular human-in-the-loop validation points.**

Built for **ETHGlobal Lisbon 2026** (July 24–26, $125k+ pool). **Anchor sponsors: World + 0G.** Optional third: Sui or Hedera.

---

## **Core Concept**

An autonomous AI agent monitors and manages a 3D grid of environmental/hardware infrastructure (e.g., decentralized compute rigs, green data centers, or sensor nodes).

* **Agentic automation:** The agent continuously loops — reads telemetry, detects anomalies, **diagnoses** them, and **proposes** a corrective action.
* **The verifiable gate:** Before any action executes, a deterministic verifier simulates it against a structural blueprint. Only safe, in-envelope actions run.
* **Modular human input:** If the verifier rejects the action, confidence is low, or a metric crosses an emergency threshold, automation halts and a **World ID**–verified human must authorize the path forward.

**Design principle:** *the LLM proposes, a deterministic referee disposes, and a verified human breaks ties.* Detection and safety-checking stay deterministic — where rules are reliable. Only **diagnosis and strategy selection** are delegated to the LLM — where reasoning over ambiguous, cross-node context is actually needed. This is what keeps the agent from being a control loop in an "AI" costume, and what gives the verifier something real to verify.

---

## **The Agent Loop (where the LLM is load-bearing)**

```
1. get_telemetry_data()        → telemetry window (trends, not just the current tick)
2. [rules] detect anomaly      → deterministic: IS something off? (thresholds are good at this)
3. [LLM]  diagnose + propose   → THE REAL DECISION (schema below)
4. verify_constraints(state, PROPOSED_ACTION)  → simulate the action → VERIFIED / VIOLATION / ESCALATE
5. VERIFIED → commit on-chain  |  VIOLATION / low-confidence → freeze → World ID human sign-off
```

### **The decision: "Diagnose-and-Propose"**

When the rules flag an anomaly, the LLM receives context and returns a structured proposal.

**Input context:**
* Telemetry **window** for the affected node **+ its neighbors** (the trend over the last N ticks, not a single value)
* Topology / dependency graph (which nodes lean on which)
* Recent event log (a neighbor just dropped offline, a prior intervention fired)
* The fixed **action menu**: `REBALANCE_LOAD | THROTTLE_NODE | ISOLATE_NODE | SCALE_UP | NO_OP | ESCALATE_TO_HUMAN`
* The blueprint's hard bounds (so it reasons *within* the safety envelope)

**Output (schema-enforced):**
```json
{
  "diagnosis": "root-cause hypothesis in natural language",
  "proposed_action": "one of the allowed enums",
  "target_nodes": ["node-ids"],
  "expected_effect": "what this should do to the metrics",
  "confidence": 0.0,
  "risk_flags": ["optional concerns"]
}
```

### **Why the LLM here is non-decorative**

* **Detection** (a threshold breach) is deterministic and rule-suited — keep it as rules.
* **Diagnosis + strategy** integrates several *weak, ambiguous* signals across nodes/time/topology into a root-cause hypothesis, then weighs tradeoffs that don't cleanly threshold. A hand-coded decision tree handles the three demo scenarios and breaks on the fourth. Generalizing to *unseen* telemetry patterns is the LLM's job — and that brittleness of the alternative is the answer to any judge's "why not a `for`-loop?"

---

## **Tech Stack**

### **Anchors — build these deep**

#### **World ($15,000) — Human-in-the-loop authorization**

**Track fit: AgentKit — New Use Cases ($8,000)** — *"human-backed agents receiving differential access or authorization."* This is Verimesh almost verbatim, and it's the single largest addressable prize.

* **How it works:** High-privilege actions (`ISOLATE_NODE`, or **any** verifier `VIOLATION`) lock the state. The UI shows "Emergency Human Intervention Required." A human operator scans their **World ID** to authorize the override and dictate the next action. World ID proving a *unique, real human* is exactly the "human-backed agent" the track asks for.
* **Note:** World ID proves personhood, not role. For a production version, gate the override on World ID **plus** an allowlist of authorized operator addresses. For the demo, World ID alone is the money moment.

#### **0G ($15,000) — Verifiable data + auditable reasoning**

**Track fit: Best AI Product ($6,000)** — *"verifiable compute, sealed inference, and decentralized storage."*

* **How it works:** Real-time telemetry **and** the agent's decision log — `{diagnosis, proposed_action, verifier verdict}` — are written to 0G. Because the reasoning trace now carries a *justified decision* (not filler), it becomes a genuine tamper-proof audit trail of an AI's action, which is what "verifiable compute / sealed inference" is asking for.

### **Optional third — only if the anchors are solid**

An on-chain state machine that anchors verified node state. Adds a chain integration's worth of scope, so treat it as a stretch goal, not a requirement.

* **Sui ($6,000)** — Best App Built on Sui ($4k realistic). Each hardware node is an on-chain **Object**; verified transitions issue a transaction. Elegant object-per-node mapping and a clean demo — **only if the team has Move capability.**
* **Hedera ($15,000 pool, ~$6k realistic)** — AI & Agentic **Payments** ($6k). Fits **only if** you lean into the agent auto-settling *financial balances* between nodes (the "auto-optimizing financial balances" angle). No Move required, bigger pool, but you must add a payments feature Verimesh doesn't currently have.

> **Scope call:** World + 0G are non-negotiable and cover ~$14k of tightly-fitting prizes with two clean integrations, no Move. If time is tight, **cut the third slot entirely** — World ID is already your state gate and 0G is already a chain holding your state. Sponsor prizes reward depth; two deep integrations beat three shallow ones.

---

## **The Product Interface (Live 3D View)**

The front-end is a clean **Three.js 2D/3D dashboard** — a grid of nodes color-coded by state (healthy / warning / violation / awaiting-human), with the agent's live reasoning trace and a dramatic "Emergency Human Intervention Required" alert on freeze.

### **The MCP Server (revised)**

The Model Context Protocol server exposes the agent's "hands"; the diagnose-and-propose reasoning is the agent's "head" (an LLM step in the loop, not a tool).

1. `get_telemetry_data()` — pulls the latest hardware-grid window from the 0G storage layer.
2. `verify_constraints(currentState, proposedAction)` — **simulates the LLM's proposed action** against the static `genio_blueprint.json` rules and returns `VERIFIED`, `VIOLATION_TRIGGERED`, or `ESCALATE`. *(Signature changed from `verify_constraints(stateData)`: the verifier's real job is caging an untrusted, non-deterministic proposal — not re-checking raw telemetry, which was redundant.)*
3. `commit_state()` — commits the new state (to 0G, or the optional on-chain object) if `VERIFIED`; otherwise halts and triggers the World ID human gate.

---

## **The Pitch Narrative**

*"We built VeriMesh. It proves that autonomous AI agents can safely manage critical physical infra without going rogue. When something looks wrong, the agent doesn't just pattern-match a threshold — it **diagnoses** the anomaly and **proposes** a fix. But it can't act on its own judgment: every proposal is simulated against a deterministic structural blueprint, and only in-envelope actions execute — the agent is sandboxed by its own referee. The moment a proposed action would break a constraint, automation instantly freezes and requires an authenticated human, via **World ID**, to sign off on the path forward. Every decision the agent makes — reasoning and verdict — is written immutably to **0G**, so the whole chain of judgment is auditable after the fact."*

---

### **Demo beat that lands**

Inject an **ambiguous** anomaly — rising temp + falling throughput + a neighbor just went offline — that rules alone *cannot* classify (benign load spike, or failure cascade?). The LLM reasons → proposes `ISOLATE_NODE`. The verifier simulates → isolating it would overload the neighbor past its thermal limit → **VIOLATION → freeze**. "Emergency Human Intervention Required." The operator scans **World ID** → authorizes the safe alternative (`SCALE_UP`, *then* isolate). Every component fires, and each one is *necessary* for the story to resolve.

**Scope discipline:** exactly **one** LLM decision point, narrow — "given a detected anomaly, return one action from a fixed menu." Don't let the agent optimize the whole grid. One real decision beats a vague autonomous optimizer.
