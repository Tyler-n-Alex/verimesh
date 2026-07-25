# Stream A — frontend / 3D

Owner: `@____` · Protocol + scope: [`BOARD.md`](BOARD.md) · Spec: plan §8
Skills: [`world-id`](../.claude/skills/world-id/SKILL.md) · [`subgraph`](../.claude/skills/subgraph/SKILL.md) · [`zerog`](../.claude/skills/zerog/SKILL.md) — **load before writing sponsor code**

> ⚠️ **World ID v4:** the plan's `verifyCloudProof` is gone. The widget will not open without a
> backend-signed `rp_context`, so **B5.1 hard-blocks A3.6.1** — build the route first. Read the
> `world-id` skill before you touch IDKit.

`apps/web/` is **empty**. You are building from zero, and you also picked up **B4** and **B5.1** in
the G1 rebalance (both are Next.js API routes that belong in your app anyway).

## ✅ You are unblocked — start now

H0 is frozen and pushed. `pnpm install`, then **A0 needs nothing from anyone** — start it this
minute. Everything through **A4.2 is B-independent** once B runs the seed
(`pnpm --filter @verimesh/agent seed`, ~2 min). That is **~7 hours of runway** with no further
dependency on B.

Import types from `@verimesh/shared` — they are final. `AuthTier`, `AuthorizationRequirement`,
`HumanApproval` and `DecisionRecord` are what the quorum modal and audit drawer render.

**Never compare nullifier strings directly.** Use `sameHuman` / `distinctNullifiers` from
`@verimesh/shared`. The same human's nullifier arrives in different representations from the widget,
the database and the chain; raw `===` will show one person as two and silently fake a T2 quorum.

**Your only real blocker is `SUBGRAPH_URL` (B2.6), and it does not bite until A3.5 at ~20:00.**
Do not wait on it — build A3.5 and A5 against a fixture matching `subgraph/schema.graphql` and swap
the endpoint in later. Ask B for a fixture at 15:00 if the spike is still running.

---

## Sat 13:30 → 16:00 · shell + live data

- [x] **A0** `apps/web` — Next.js (app router) + Tailwind + **HeroUI v3**; dark shell, layout
      regions for mesh / trace / event log / inspector · 60m · needs: H0.7 · done 14:15
      - stack as installed: Next **15.5.21** · React **19.2** · Tailwind **4.3** · HeroUI **3.2.2**
        · R3F **9.6** + drei **10.7** + postprocessing **3.0** · three **0.185** · zustand **5**
        · IDKit **4.2.1**. **HeroUI v3 is out of beta** — install `@heroui/react@^3.2.2`, *not*
        `@beta` as the `heroui-react` skill still says. Peer-requires React ≥19 + Tailwind ≥4, which
        is why R3F 9 (not 8) is the correct pairing.
      - Next 15.5 deliberately, not 16 — Turbopack-by-default + three.js is an unknown we do not
        need to price in tonight.
      - ⚠️ **env trap (supersedes H0.10 for this app):** Next reads `.env.local` from the *app*
        directory, not the monorepo root, so the root `.env.local` was invisible and every panel
        rendered "mesh unreachable". Fixed in `apps/web/load-root-env.mjs`, called from
        `next.config.mjs`: it parses the root `.env.local`, merges it into `process.env`, and
        re-exports the `NEXT_PUBLIC_*` keys via the `env` config. It also mirrors
        `SUBGRAPH_URL` → `NEXT_PUBLIC_SUBGRAPH_URL`, `REGISTRY_EXPLORER`/`REGISTRY_ADDRESS` →
        their `NEXT_PUBLIC_*` twins, so **B and C only ever fill in the root file** and the browser
        still sees what it needs. **Do not create `apps/web/.env.local`.**
- [x] **A1** Supabase realtime hook — subscribe to `nodes`, `events`, `proposals`, `verdicts`,
      `human_gates`; render the seeded node list as plain rows first · 45m · needs: B0 · done 14:15
      - `src/hooks/useMeshRealtime.ts`: one channel, six `postgres_changes` subscriptions
        (`nodes`, `events`, `proposals`, `verdicts`, `human_gates`, `human_approvals`) plus a
        parallel initial `select` for all nine tables. Verified live against the seeded mesh:
        **16 nodes · opA 6 / opB 6 / opC 4**, link pill reads `supabase live`.
      - ℹ️ **for B:** `commits` and `telemetry` are *not* in the `supabase_realtime` publication
        (`0001`/`0002` never added them). Not blocking — the hook polls `commits` every 4s and the
        sparkline accumulates from the realtime `nodes.metrics` updates. If you add
        `alter publication supabase_realtime add table public.commits, public.telemetry;` the poll
        can go away, but nothing waits on it.
- [x] **A1.5** zustand store fed by the realtime hook; one shape the 3D and the panels both read
      · 30m · needs: A1 · done 14:15
      - `src/store/mesh.ts` is the single shape: `nodes` keyed by id + stable `nodeIds`, `edges`
        (each pre-tagged `crossOperator`, which is what the T2 beat reads), `events`/`proposals`
        newest-first and capped, `verdicts`/`commits` keyed by `proposal_id`, `approvals` keyed by
        `gate_id`, a capped per-node `telemetry` ring, and the UI selections
        (`selectedNodeId`, `activeGateId`, `auditProposalId`).

---

## Sat 16:00 → 19:00 · the 3D mesh (plan §8 A2)

- [x] **A2.1** R3F scene — camera, controls, node instances positioned from `pos`, edges as lines
      · 90m · needs: A1.5 · done 14:55
      - `components/mesh/`: `MeshScene` (Canvas + lights + fog + composer), `NodeInstances`,
        `EdgeLines`, `NodeLabels`, `CameraRig`, `PerfProbe`; `MeshViewport` wraps it with
        `next/dynamic({ssr:false})`, the legend, the fps HUD and a roster fallback.
      - `CameraRig` frames the mesh from the hydrated node set (`meshCenter`/`meshRadius` in
        `lib/layout.ts`) and re-frames on container resize, so it stays composed at any panel
        width — nothing is hard-coded to the 16-node blueprint.
- [x] **A2.2** Status-driven materials — `healthy` / `warning` / `violation` / `awaiting_human` /
      `isolated` / `offline`; **operator-distinct colouring** (opA vs opB must be readable at a
      glance — the cross-operator quorum beat depends on judges seeing the boundary) · 60m · needs: A2.1 · done 14:55
      - the encoding is **operator = hue, status = ring**, so the two never fight for the same
        channel: node body fill + floor tile carry the operator (opA sky · opB orange · opC violet),
        a torus ring around each node carries the status. Single source of truth in `lib/palette.ts`,
        which also emits the matching CSS variables — the 3D and the DOM cannot drift.
      - **the cross-operator boundary is the loudest thing in the scene by design**: an edge's two
        vertices are coloured by their *own* endpoint's operator, so a same-operator link is solid
        and a cross-operator link is a visible **gradient** from one operator's hue to the other's,
        drawn twice as thick. Judges see the boundary without being told where it is.
- [x] **A2.3** Postprocessing + motion — bloom on violation, pulse on `awaiting_human`, edge
      animation on load transfer · 45m · needs: A2.2 · done 14:55
      - selective-by-luminance bloom: status rings are `toneMapped={false}` `meshBasicMaterial` with
        per-instance colours scaled past 1.0 by `STATUS_VISUALS.haloIntensity`, so only the states
        that should glow cross the bloom threshold. `violation` also bobs and pulses at 2.4Hz,
        `awaiting_human` at 1.15Hz.
      - edge motion is `LineMaterial.dashOffset` advanced in `useFrame`, and **the flow speed is the
        mesh's mean load** — the links visibly speed up as the mesh loads. A third line set lights up
        edges incident to a `violation`/`awaiting_human` node at ~3.4× flow.
      - verified against a real violation driven through Supabase (`node-07` violation, `node-12`
        warning, `node-05` awaiting_human, `node-14` isolated, `node-03` offline): the beat reads at
        a glance. Bloom/halo gains were pulled back from a first pass that bled magenta over the
        whole mesh.
- [x] **A2.4** Perf pass — instancing, no per-frame allocation, capped DPR. It must hold 60fps on
      the demo laptop while the loop is writing · 30m · needs: A2.3 · done 14:55
      - **measured 60fps, min 49, `1` draw call** with all 16 nodes + 25 edges + 5 non-healthy
        states live. HUD bottom-right of the viewport reports fps / min fps / draw calls, so this is
        re-checkable on the demo laptop rather than assumed (that is also what A6.2 reads).
      - three `InstancedMesh`es (body · status ring · operator floor tile) and three batched
        `LineSegments2`; `dpr={[1,1.6]}`, `antialias:false`, `multisampling={0}`, no normal pass.
      - **zero allocation in `useFrame`**: one module-scope `Object3D` and two `Color`s are reused
        for every instance write.
      - **telemetry never re-renders React.** The scene reads `useMeshStore.getState()` inside
        `useFrame`; the only component-level subscriptions are to `nodeIds`, `edges`, and a derived
        *alert-signature string* — a primitive, so it only fires when a node actually changes status.
        Node labels subscribe per-node to rounded metrics, so a label re-renders ~1/s, not 60/s.

---

## Sat 18:00 → 21:00 · panels (plan §8 A3, A4)

- [x] **A3.1** Reasoning trace panel — streaming steps: telemetry → detect → **history** → propose →
      verify → commit/freeze · 60m · needs: A1.5 · done 15:25
      - `lib/trace.ts` derives the six-step cycle from the newest proposal plus its verdict, commit
        and gate, and the events scoped to that node. Each step carries its own `idle`/`active`/
        `done`/`blocked`/`failed` state, so the panel *streams* — a step lights up and starts pulsing
        the moment its row lands, without waiting for the cycle to finish.
      - the propose step renders the diagnosis, expected effect, a confidence bar, the risk flags and
        a **0G Compute attestation badge** off `zerog_inference_valid`; verify renders the verdict and
        the exact breached bound; resolve renders either the commit (0G root + registry tx) or the
        freeze, with a **review authorization →** button straight into the quorum modal.
- [x] **A3.2** Event log — `events` table, newest first, colour-coded by type · 30m · needs: A1.5 · done 15:25
      - `eventColor` matches on substrings, so B can add event types without touching the frontend and
        they still colour correctly. Rows are click-to-select-node and there is a
        "only *this node*" filter that appears when a node is selected.
- [x] **A4.1** Node inspector — click a node → metrics, operator, status, recent telemetry sparkline
      · 45m · needs: A2.1 · done 15:25
      - six live metrics, three sparklines (temp / load / throughput). The temp and load sparklines
        **draw the blueprint bound as a dashed red rule** (`T_max`, `L_max` read from
        `@verimesh/shared`'s blueprint) and the number turns amber/red as it crosses — you can see
        the breach coming rather than reading it after the fact.
      - a neighbours strip, where **cross-operator neighbours are outlined in the neighbour's own
        operator colour** — the blast-radius question the tier depends on, answered inline.
- [x] **A4.2** Action menu — the fixed `ACTIONS` set, manual trigger for rehearsal · 30m · needs: A4.1 · done 15:25
      - all six `ACTIONS` from `@verimesh/shared`, posting to **`/api/rehearse`**, which writes a
        proposal + verdict (+ a gate when it needs a human) marked `llm_provider: "rehearsal"` and
        `risk_flags: ["rehearsal"]` so rehearsal rows are always distinguishable from real ones.
      - ⚠️ the route's `rehearsalRequirement` is **deliberately not the real policy** — it is a local
        stand-in that reads the edge table for cross-operator neighbours so A can rehearse the T1 and
        T2 modals before C lands `authz.ts`. It is named for that. **When C ships `requireAuthorization`,
        this function should be deleted and the route should call the real one.**

---

## Sat 20:00 → 23:00 · The Graph views (plan §8 A3.5, A5) — **the Graph track's UI**

- [x] **A3.5.1** GraphQL client (plain `fetch` is fine) against `SUBGRAPH_URL` · 20m · needs: B2.6
      · done 15:25 · **not blocked after all — see below**
      - `lib/subgraph.ts` holds all five queries as exported strings (so A5.2 can show the literal
        text judges could run) and a `gql()` helper returning
        `{data, source: "live"|"fixture", error, queryText, variables, endpoint, ms}`.
      - **B2.6 never blocked this.** `lib/subgraphFixture.ts` is a fixture shaped *exactly* like
        `subgraph/schema.graphql` — `Decision`/`Freeze`/`Approval`/`Override`/`HumanAuthority`/
        `NodeHistory`, `ts` as a seconds string, ids as `bytes32` hex, and a node→operator map matching
        the blueprint. `gql()` falls back to it when `NEXT_PUBLIC_SUBGRAPH_URL` is unset **or when a
        live query throws**, so the whole Graph track is built and demoable now and **nothing changes
        when B pastes the URL in** — the env loader already mirrors `SUBGRAPH_URL` into
        `NEXT_PUBLIC_SUBGRAPH_URL`.
      - every view shows a **`subgraph · Nms`** or **`fixture`** badge plus the endpoint, so we can
        never accidentally demo a fixture believing it is live.
- [x] **A3.5.2** **Per-operator decision history** — query the subgraph by `operator`, filterable by
      `verdict` · 45m · needs: A3.5.1 · done 15:25
      - opA/opB/opC switch + all/VERIFIED/VIOLATION/ESCALATE filter; each row shows the tier chip,
        autonomous-vs-human-authorized, and the registry tx, and opens the audit drawer.
- [x] **A3.5.3** **Incident timeline** per node · 30m · needs: A3.5.1 · done 15:25
      - follows the mesh selection, and heads with the `NodeHistory` counters
        (`incidentCount` / `violationCount`) — the same numbers the ✦ history-escalated tier reads,
        so a repeat offender is visible before the policy escalates on it.
- [x] **A3.5.4** ◈ **"the agent cited this" panel** — surface the exact `get_history` result the LLM
      had in context, inline in the trace. Judges must *see* the memory being consulted, not just
      hear it claimed · 45m · needs: A3.1, B6.2 · done 15:25
      - renders inline in the `get_history` trace step, with a **show query** toggle that reveals the
        literal GraphQL that produced it.
      - 📌 **CONTRACT FOR B (B6.2):** the panel reads the newest `events` row whose `type` contains
        `history`. Put the `get_history` result in `message`:
        **as JSON** (an array of `HistoryEntry` from `@verimesh/shared`, or `{entries:[…]}`) → it
        renders as structured rows (node · operator · action · verdict · outcome · time);
        **as plain text** → it renders verbatim in a `<pre>`. Both paths already work, so *anything*
        you write shows up — JSON just looks materially better on stage. Nothing else is needed.
- [ ] **A5.1** **Audit drawer** — click any decision → live GraphQL query → the indexed record,
      the 0G Storage blob, the registry tx (Basescan link), ✦ the distinct signers and the tier · 60m
      · needs: A3.5.1
- [ ] **A5.2** Show the raw GraphQL query text in the drawer, copyable — the "any operator can run
      this exact query" framing only lands if they can see the query · 20m · needs: A5.1

---

## Sat 21:00 → Sun 01:00 · ✦ World ID + the quorum modal (plan §8 A3.6)

- [x] **B5.1** *(picked up)* `/api/worldid/sign` (RP context via `signRequest` from
      `@worldcoin/idkit-core/signing`) + `/api/worldid/verify` (POST
      `developer.world.org/api/v4/verify/{rp_id}`) · 45m · unblocks: A3.6.1 · done 16:00
      - 🔧 **two corrections to the `world-id` skill, both would have silently broken the scan** —
        skill file updated:
        1. `signRequest()` returns **camelCase** `createdAt` / `expiresAt`, but the `RpContext` the
           widget consumes wants **snake_case** `created_at` / `expires_at`. The skill's snippet reads
           `sig.created_at`, which is `undefined` — the widget would refuse to open with no useful
           error. The route maps between them explicitly.
        2. `signRequest({signingKeyHex, action})` **signs the action**, so the widget's `action` prop
           must be byte-identical or the proof is invalid. `/api/worldid/sign` therefore **returns the
           `action` it signed** and the widget uses that value rather than reading env itself. One
           less way to fail at 3am.
      - `/api/worldid/verify` never trusts the client: the nullifier is taken from **our** call to the
        World verifier, then run through `normalizeNullifier` before it touches the database.
        It enforces, in order: gate still pending → signer is on a **required operator's** allowlist →
        **not a repeat nullifier** (`distinctNullifiers`, never `===`) → insert → recompute the
        quorum. The Postgres unique-index violation (`23505`) is mapped to the same
        `DUPLICATE_NULLIFIER` rejection, so the app-level and database-level checks surface
        identically. **Verified against the live DB: the second insert of the same nullifier returns
        `23505`.**
      - 📌 **for B (B5.6 enrolment):** `authz_config.json`'s operator arrays are still empty. While
        *every* array is empty, or with `WORLDID_ALLOW_SELF_ENROLL=true`, the route accepts an
        unenrolled human and returns `{nullifier, enrolledFor: [], selfEnrolled: true}` — **scan once
        with each demo phone, copy the two `nullifier` values straight into `authz_config.json`**, and
        the allowlist check becomes live automatically with no code change. Make sure both arrays are
        populated before the demo, or T1/T2 will accept anyone.
      - 📌 **seam with B5.4/B5.5:** when the quorum is satisfied the route sets
        `human_gates.status = "authorized"` and emits an `override` event. **B still owns turning that
        into the on-chain `resolveOverride` + commit** — this route deliberately does not touch a chain.
- [x] **A3.6.1** IDKit widget wired to those routes; one successful scan end-to-end · 45m · needs: B5.1
      · done 16:00 · ⚠️ **needs credentials to close out — see below**
      - `components/worldid/WorldIdScan.tsx` mints the `rp_context` **when the button is pressed**, not
        at page load, so it cannot be expired by the time a judge scans. `signal` is bound to
        `gate-${gateId}`, so a proof from an earlier freeze cannot be replayed into a later one.
      - the full path is wired and typechecked against the real IDKit 4.2.1 surface, and the route
        degrades to a clear **"World ID is not configured: missing NEXT_PUBLIC_WORLDID_APP_ID, …"**
        message rather than a dead button.
      - 🚨 **BLOCKED on credentials, not on code:** `NEXT_PUBLIC_WORLDID_APP_ID`, `WORLDID_RP_ID` and
        `WORLDID_SIGNING_KEY` are **all still empty in `.env.local`**. The literal "one successful scan
        end-to-end" cannot be ticked until those are filled in from the Developer Portal. Everything
        downstream of the scan is already proven with real database rows.
- [x] **A3.6.2** **Freeze modal, T1** — renders the required tier, a single slot, and the
      operator-allowlist check · 45m · needs: A3.6.1, B5.4 · done 16:00
      - one slot, labelled with the operator, and copy that names the distinction explicitly: World ID
        proves this is *a* unique human, the allowlist proves it is *the right one*. A
        `NOT_ON_ALLOWLIST` rejection renders as its own state naming the operator it needed.
- [x] **A3.6.3** **Freeze modal, T2 quorum tracker** — two slots, "Operator A ✅ · Operator B ⬜ —
      1 of 2 authorized", each filled by a *distinct* scan, and the plain-English reason
      ("isolating **opA**'s node-07 would breach **opB**'s node-12") · 75m · needs: A3.6.2, B5.5
      · **this is the money shot — give it real polish** · done 16:00
      - **verified at 0-of-2, 1-of-2 and 2-of-2 against real `human_approvals` rows.** Slots fill
        independently, each showing the distinct nullifier that filled it and the time; the counter
        reads "N of 2 authorized"; the CTA **relabels itself to "scan as opB"** once opA has signed, so
        the person holding the second phone is told what to do.
      - the reason string is parsed and the **operator names are coloured with the same hues the 3D
        mesh uses**, so "isolating opA's node-07 would breach opB's node-12" ties directly to the
        boundary on screen.
      - a repeat scan renders **"REJECTED — SAME HUMAN CANNOT COUNT TWICE"**, which is the World
        differentiator stated out loud at the moment it is enforced.
      - the footer states *"the agent cannot proceed until this is satisfied"* while pending, then flips
        to *"2 distinct humans authorized — releasing to commit"*.
      - ⚠️ **HeroUI v3's `Modal` was tried and dropped for this one surface.** It is built on React
        Aria's `DialogTrigger`, so it expects a pressable trigger child; driven programmatically from a
        realtime gate row it warned `PressResponder was rendered without a pressable child` and its
        `Modal.Container` overrode the width. `components/ui/Overlay.tsx` replaces it — same
        `role="dialog"`/`aria-modal`/labelling, Escape-to-close, Tab-cycle containment and
        focus restore. HeroUI stays installed and its style layer is active; the console's surfaces are
        deliberately hand-built because they are all bespoke data displays, and **the one screen the
        whole World track rests on should not depend on a component fighting its own trigger model.**
- [ ] **A3.6.4** ✦ **Authz ledger** in the audit views, from the subgraph — per decision: which
      distinct nullifiers signed + the tier; per human: remaining override budget · 45m
      · needs: A3.5.1, B5.7

---

## Sun 01:00 → 04:00 · 0G + finish

- [ ] **B4** *(picked up)* 0G Storage — write the reasoning blob, store `zerog_root`, link it from
      the audit drawer · 45m · needs: B3
- [ ] **A6.1** Empty / loading / error states everywhere. A blank panel during the demo reads as
      broken · 45m
- [ ] **A6.2** Full pass on the demo laptop at demo resolution, projector-legible text · 30m
