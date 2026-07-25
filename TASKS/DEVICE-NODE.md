# Device node — the Galaxy S22 as a real physical node

Owner: `@____` (Stream A) · Spec: base plan **§9E** · Board: [`BOARD.md`](BOARD.md) · Stream: [`STREAM-A.md`](STREAM-A.md)

**The claim this buys us:** one node in the mesh is not simulated. A Samsung Galaxy S22 reports its
own **real CPU utilisation** and **real battery temperature** into the mesh over its own network
link, and when you make it hot it genuinely crosses its own thermal bound, is genuinely detected,
and — because its neighbour belongs to a different operator — genuinely drives a **T2 cross-operator
quorum**. It kills the "it's just a simulation" objection, and because the *phone* is under load and
not the render laptop, it cannot make the 3D demo lag.

> ⚠️ **Narrate it precisely.** CPU load and battery temperature are genuine sensors. Throughput is a
> *measured work rate* (a fixed busy-loop timed each tick), which is also real but is a derived
> figure — say "measured work rate", not "throughput sensor". The handset has no fan, so fan speed
> reads `—` rather than a fabricated number. **We deliberately do not apply the plan's `GAIN`
> multiplier**: the number on screen is the number the sensor reported. Overclaiming loses Q&A trust,
> and it is not needed — the phone crosses its own real bound on its own.

---

## Status — the path is built and proven; the handset is not yet attached

Everything below the phone is done and verified against the live database with a simulated handset
(`services/device/fake-phone.js`). What remains is **~20 minutes on the phone itself**.

- [x] **D0** Migration `supabase/migrations/0003_device_node.sql` — `nodes.kind` / `nodes.device_label` /
      `nodes.last_seen_at`, `telemetry.source`, plus indexes · **applied to Supabase and verified**
- [x] **D1** `apps/web/src/lib/device.ts` — node identity, device-appropriate bounds, bearer-token
      auth, staleness window, and the deterministic `classifyDevice` band function
- [x] **D2** `POST /api/device/register` — idempotent: upserts the device node and its edges, and
      **reports which neighbour is cross-operator**. Verified: two calls → `edgesAdded: 2` then `0`,
      and it returns `crossOperator: [{node: "node-11", operator: "opB"}]`
- [x] **D3** `POST /api/device/telemetry` — bearer-token ingest; writes a `telemetry` row with
      `source: 'real'`, updates `nodes.metrics` + `last_seen_at`, and emits a transition event.
      Verified `healthy → warning → violation → healthy` against the live DB
- [x] **D4** `services/device/report.js` (Termux reporter) + `services/device/stress.sh` (bounded
      burst) + `services/device/fake-phone.js` (a laptop stand-in, so this whole track was buildable
      and demoable without touching the phone)
- [x] **D5** UI — `Live · Galaxy S22` badge in the mesh label, the roster and the inspector; a
      **`No signal`** state when it goes stale; a ring marker in the 3D; and a *Physical device* block
      in the inspector showing battery %, SoC temperature, charging state, seconds-since-last-report,
      and a plain-English note on which figures are sensors
- [x] **D6** This doc + `.env.example` additions + `NEXT_PUBLIC_DEVICE_*` wired into the env loader
- [ ] **D7** **Phone setup on the actual S22** · ~20m · *the only remaining step* — see below
- [ ] **D8** Bind `stress.sh` to a **Termux:Widget** home-screen button so the beat is *tap the phone*
      · 10m · needs: D7
- [ ] **D9** Rehearse the full beat: tap phone → device goes `violation` → agent proposes
      `ISOLATE_NODE` → verifier says isolating it breaches **opB**'s `node-11` → **T2 quorum** · 20m
      · needs: D7, and B's loop for the LLM step (the freeze itself can be rehearsed now via the
      inspector's action menu)
- [ ] **D10** Venue check: confirm the phone can reach the laptop on the day (USB tether preferred)
      · 10m · needs: D7

---

## How it is wired

```
Galaxy S22 (Termux)                      Laptop (Next.js)                 Supabase
  /proc/stat            ── load ──┐
  termux-battery-status ── temp ──┤
  /sys/class/thermal    ── soc  ──┼──▶ POST /api/device/telemetry ──▶ telemetry (source:'real')
  /proc/meminfo         ── mem  ──┤       Bearer DEVICE_TOKEN            nodes.metrics
  timed busy loop       ── work ──┘                                     nodes.last_seen_at
                                                                        events (on transition)
```

**The phone never holds a Supabase key.** It holds one invented `DEVICE_TOKEN` and talks only to our
own API route, which uses the service key server-side. This is a deliberate change from the plan's
§9E sketch, which had the phone POST straight to Supabase REST with a "demo-scoped insert key" — that
would have required opening an anon `INSERT` policy on `telemetry`, i.e. anyone with the publishable
key could forge telemetry for any node. Routing through the route also lets the server own the
threshold logic and keeps derivation in one place.

**Where it sits in the mesh.** `device-s22`, operator **opC**, at position `[5, 0, 2]` — deliberately
*outside* the 4×4 grid, so the real node reads visually as the outsider it is. Two links:

| Link | Operator | Weight | Why |
|---|---|---|---|
| `device-s22` ↔ `node-15` | opC → opC | 0.4 | same-operator, keeps it a real member of opC's fleet |
| `device-s22` ↔ `node-11` | opC → **opB** | 0.6 | **cross-operator — this is what makes isolating the phone a T2 quorum** |

This leaves the existing opA `node-07` → opB `node-12` story completely untouched, so B and C are
unaffected and we now have **two** independent T2 paths.

---

## Phone setup (D7) — ~20 minutes, once

1. **Install Termux and Termux:API from F-Droid.** *Not* the Play Store — that build is abandoned and
   `termux-battery-status` will not work. Both apps must come from the same source or the API bridge
   is refused.
2. In Termux:
   ```sh
   pkg update && pkg install nodejs termux-api stress-ng git
   termux-battery-status
   ```
   That last command must print JSON including `"temperature"`. If it hangs or errors, Termux:API is
   missing or its permission was denied — fix that before going further, because battery temperature
   is the whole point.
3. **Stop Android killing it:** disable battery optimisation for Termux (Settings → Apps → Termux →
   Battery → Unrestricted), and in the session run `termux-wake-lock`.
4. **Get the two files onto the phone** — either `git clone` the repo, or paste them:
   `services/device/report.js` and `services/device/stress.sh`.
5. **Point it at the laptop and run it:**
   ```sh
   export VERIMESH_INGEST_URL="http://<laptop-ip>:3000/api/device/telemetry"
   export VERIMESH_DEVICE_TOKEN="<the DEVICE_TOKEN from the repo-root .env.local>"
   node report.js
   ```
   It prints one line per tick: `#12 load 34% batt 31.2C soc 39.4C work 980 -> healthy`.

### Getting the phone to the laptop — pick one, test it early

| Route | How | Notes |
|---|---|---|
| **USB tether** *(recommended)* | Plug in, enable USB tethering, use the laptop's tether IP | **Independent of venue WiFi**, and it keeps the phone charged — which you need anyway to get it hot. Most reliable option on the day. |
| Same WiFi | `VERIMESH_INGEST_URL=http://<laptop-lan-ip>:3000/...` | Fine at the desk. Venue WiFi often blocks client-to-client traffic — test it before relying on it. |
| Cellular | Needs the app on a public URL | Only if we deploy `apps/web`. Not required for the demo. |

Find the laptop IP with `ipconfig` (Windows). The dev server already listens on the LAN — Next prints
a `Network:` URL on startup. If the phone cannot reach it, Windows Firewall is the usual cause.

---

## Making it fail on cue (D8)

```sh
bash stress.sh 45 8      # 45 seconds, 8 workers
```

Bounded and self-killing, with a pure-shell fallback if `stress-ng` is missing. Keep the phone
**plugged in** — charging plus sustained CPU load is what actually moves battery temperature, and it
is what gets you from ~29 °C to past `T_max` in about a minute. Short bursts only; phones throttle
themselves safely, and we do not need or want a hot phone for long.

Bind it to a **Termux:Widget** button (`~/.shortcuts/heat-the-phone.sh` calling `stress.sh`) so the
demo beat is literally *tapping the phone in your hand*.

### Bounds — why these numbers

| Bound | Value | Reason |
|---|---|---|
| `DEVICE_T_WARN` | 37 °C | An S22 idles ~28–31 °C. 37 is clearly above idle but reachable in seconds. |
| `DEVICE_T_MAX` | 41 °C | Reachable in ~60–90 s of `stress-ng` while charging, and safely below the ~45 °C at which Android throttles hard and stops charging. |
| `DEVICE_L_MAX` | 0.85 | `stress-ng --cpu 8` saturates the S22's cores; 0.85 is crossed immediately. |

All four are env-tunable (`DEVICE_T_WARN`, `DEVICE_T_MAX`, `DEVICE_L_MAX`, `DEVICE_X_NOMINAL`).
**Measure the phone's real idle temperature at the venue and re-tune if the room is hot** — a cold
room and a warm room differ by several degrees.

---

## Working around Stream B (as requested)

The plan's ownership split is **the phone owns the node's metrics; the agent owns its status**. B's
loop is not running yet, so nothing would ever set the device red.

`DEVICE_OWNS_STATUS=true` (the default) makes the **ingest route** do the deterministic
`healthy`/`warning`/`violation` classification itself, so the device is fully demoable today.

- **When B's loop comes online, set `DEVICE_OWNS_STATUS=false`.** The ingest route then writes only
  metrics and `last_seen_at`, and B's detect step owns status exactly as the plan intends. One env
  var, no code change.
- **Either way the ingest never stomps a human-gated state.** If the node is `isolated` or
  `awaiting_human`, the route holds that status regardless of the flag, so a freeze in progress
  cannot be cleared by the next telemetry tick two seconds later. It reports `held: true` when this
  happens.
- The classification duplicates the *intent* of B's detect step, not its code. It is a stand-in and
  it is flagged as one, the same way `/api/rehearse` was before C's `authz.ts` landed.

### 📌 Two things for B

1. **The seed deletes all edges.** `services/agent/src/seed.ts` does
   `.from("edges").delete().gte("id", 0)` and reinserts only the blueprint's 25. That wipes the
   device's two links. **Re-run `POST /api/device/register` after any seed** — it is idempotent, so
   running it always is safe. Better long-term fix: add `device-s22` and its two edges to
   `genio_blueprint.json`, which is yours (H0/shared) — happy to hand over the exact rows.
2. **For the loop:** read the device's latest `telemetry` row instead of simulating it, and **fall
   back to simulating when `nodes.last_seen_at` is older than ~8 s** (`NEXT_PUBLIC_DEVICE_STALE_MS`).
   The frontend already computes and displays that staleness, so a dropout shows as **`No signal`**
   and degrades the demo instead of breaking it — the single most important safeguard in §9E.

---

## Verifying without the phone

```sh
# one-time, and after any seed
curl -X POST http://localhost:3000/api/device/register \
  -H "Authorization: Bearer $DEVICE_TOKEN"

# drive the bands: idle | warm | hot   (2nd arg = tick count, omit to stream)
VERIMESH_DEVICE_TOKEN=$DEVICE_TOKEN node services/device/fake-phone.js hot 1
VERIMESH_DEVICE_TOKEN=$DEVICE_TOKEN node services/device/fake-phone.js hot     # streams
```

Already verified this way: auth rejects a missing and a wrong token (401); register is idempotent and
names `node-11`/`opB` as the cross-operator neighbour; and the bands transition with quotable event
messages, e.g.

> `device-s22 warning -> violation: battery temperature 42.5C at or above T_max 41C; cpu load 95% at or above L_max 85%`

The reasoning-trace panel picked the device up **with no frontend change**, because it matches events
whose type contains `anomaly` — so the phone's own failure already streams into the trace.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Android kills Termux mid-demo | `termux-wake-lock` + battery optimisation off + plugged in. Watch for `No signal` in the UI. |
| Venue WiFi blocks client-to-client | USB tether. Test on arrival, not at 4am. |
| Play Store Termux installed | Reinstall both Termux and Termux:API from F-Droid. `termux-battery-status` is the canary. |
| Room temperature shifts the bounds | Re-measure idle temp at the venue; retune `DEVICE_T_WARN`/`DEVICE_T_MAX`. |
| Phone drops out mid-beat | Staleness fallback: UI shows `No signal`, agent sims the node. Demo degrades, never breaks. |
| A seed wipes the device edges | Re-run `/api/device/register` (idempotent). |
| It is cuttable | **Nothing in the scripted demo depends on it.** The opA `node-07` → opB `node-12` T2 path is untouched. |
