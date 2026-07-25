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

- [ ] **A2.1** R3F scene — camera, controls, node instances positioned from `pos`, edges as lines
      · 90m · needs: A1.5
- [ ] **A2.2** Status-driven materials — `healthy` / `warning` / `violation` / `awaiting_human` /
      `isolated` / `offline`; **operator-distinct colouring** (opA vs opB must be readable at a
      glance — the cross-operator quorum beat depends on judges seeing the boundary) · 60m · needs: A2.1
- [ ] **A2.3** Postprocessing + motion — bloom on violation, pulse on `awaiting_human`, edge
      animation on load transfer · 45m · needs: A2.2
- [ ] **A2.4** Perf pass — instancing, no per-frame allocation, capped DPR. It must hold 60fps on
      the demo laptop while the loop is writing · 30m · needs: A2.3

---

## Sat 18:00 → 21:00 · panels (plan §8 A3, A4)

- [ ] **A3.1** Reasoning trace panel — streaming steps: telemetry → detect → **history** → propose →
      verify → commit/freeze · 60m · needs: A1.5
- [ ] **A3.2** Event log — `events` table, newest first, colour-coded by type · 30m · needs: A1.5
- [ ] **A4.1** Node inspector — click a node → metrics, operator, status, recent telemetry sparkline
      · 45m · needs: A2.1
- [ ] **A4.2** Action menu — the fixed `ACTIONS` set, manual trigger for rehearsal · 30m · needs: A4.1

---

## Sat 20:00 → 23:00 · The Graph views (plan §8 A3.5, A5) — **the Graph track's UI**

- [ ] **A3.5.1** GraphQL client (plain `fetch` is fine) against `SUBGRAPH_URL` · 20m · needs: B2.6
- [ ] **A3.5.2** **Per-operator decision history** — query the subgraph by `operator`, filterable by
      `verdict` · 45m · needs: A3.5.1
- [ ] **A3.5.3** **Incident timeline** per node · 30m · needs: A3.5.1
- [ ] **A3.5.4** ◈ **"the agent cited this" panel** — surface the exact `get_history` result the LLM
      had in context, inline in the trace. Judges must *see* the memory being consulted, not just
      hear it claimed · 45m · needs: A3.1, B6.2
- [ ] **A5.1** **Audit drawer** — click any decision → live GraphQL query → the indexed record,
      the 0G Storage blob, the registry tx (Basescan link), ✦ the distinct signers and the tier · 60m
      · needs: A3.5.1
- [ ] **A5.2** Show the raw GraphQL query text in the drawer, copyable — the "any operator can run
      this exact query" framing only lands if they can see the query · 20m · needs: A5.1

---

## Sat 21:00 → Sun 01:00 · ✦ World ID + the quorum modal (plan §8 A3.6)

- [ ] **B5.1** *(picked up)* `/api/worldid/sign` (RP context via `signRequest` from
      `@worldcoin/idkit-core/signing`) + `/api/worldid/verify` (POST
      `developer.world.org/api/v4/verify/{rp_id}`) · 45m · unblocks: A3.6.1
- [ ] **A3.6.1** IDKit widget wired to those routes; one successful scan end-to-end · 45m · needs: B5.1
- [ ] **A3.6.2** **Freeze modal, T1** — renders the required tier, a single slot, and the
      operator-allowlist check · 45m · needs: A3.6.1, B5.4
- [ ] **A3.6.3** **Freeze modal, T2 quorum tracker** — two slots, "Operator A ✅ · Operator B ⬜ —
      1 of 2 authorized", each filled by a *distinct* scan, and the plain-English reason
      ("isolating **opA**'s node-07 would breach **opB**'s node-12") · 75m · needs: A3.6.2, B5.5
      · **this is the money shot — give it real polish**
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
