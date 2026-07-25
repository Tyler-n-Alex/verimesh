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

## Phone setup (D7) — ~20 minutes, once · **no-cable route**

### Reaching the host without a cable

**The phone must reach whichever machine runs `pnpm --filter @verimesh/web dev`.** Call that machine
the **host**. Everything below is relative to the host, not to any particular laptop — the code is in
git and the schema and the device registration live in Supabase, so the device node works from any
machine that pulls the repo and has the `DEVICE_*` env vars.

| Route | Host address | Verdict |
|---|---|---|
| **Tailscale** | the host's `100.x.y.z` | ✅ **Use this.** Works over **cellular or any WiFi**, so the phone and the host do not need to be on the same network at all — which matters if the host is on an external network. Immune to venue WiFi and to client-isolation, encrypted, and the address does not change when either device changes network. |
| Same-WiFi LAN | the host's `192.168.x.y` | Only if the phone and host are on the *same* router. Fine at a desk. Venue WiFi often blocks phone→laptop traffic, so treat it as a backup. |
| Cellular direct | — | Would need `apps/web` deployed publicly. Not required; Tailscale already solves this. |

**Find the host's Tailscale address**, on the host:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" ip -4
```

If the CLI is not on `PATH`, the Tailscale tray icon shows the address, as does the phone's own
Tailscale device list once both are signed in to the same account.

⚠️ **A consumer VPN on the host will break this.** NordVPN, ExpressVPN and similar frequently ship a
kill-switch or "block LAN traffic" setting, and they fight Tailscale for routing. If the phone cannot
reach the host, **disconnect that VPN first** — it is the most likely cause.

⚠️ **Windows Firewall blocks inbound 3000 by default.** Run once, in an **admin** PowerShell on the
host:

```powershell
New-NetFirewallRule -DisplayName "Verimesh dev 3000" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 3000
```

To undo after the event: `Remove-NetFirewallRule -DisplayName "Verimesh dev 3000"`.

### Host checklist before touching the phone

```powershell
git pull
pnpm install
```

The host's repo-root `.env.local` needs the device block (it is gitignored, so it does **not** travel
with the pull — copy these across, keeping `DEVICE_TOKEN` identical to whatever the phone will send):

```
DEVICE_TOKEN=<pick any string; the phone must send exactly this>
DEVICE_OPERATOR=opC
DEVICE_LABEL=Galaxy S22
DEVICE_T_WARN=37
DEVICE_T_MAX=41
DEVICE_L_MAX=0.85
DEVICE_X_NOMINAL=1000
DEVICE_OWNS_STATUS=true
NEXT_PUBLIC_DEVICE_NODE_ID=device-s22
NEXT_PUBLIC_DEVICE_STALE_MS=8000
```

Then start the app and register the node once:

```powershell
pnpm --filter @verimesh/web dev
# in a second terminal
curl -X POST http://localhost:3000/api/device/register -H "Authorization: Bearer <DEVICE_TOKEN>"
```

`device-s22` is **already registered in Supabase** with both of its edges, so this is only needed on a
fresh database or after someone re-runs the seed. It is idempotent — running it is always safe.

### On the phone

1. **Install Termux.** Exact names and package IDs on F-Droid — note the **colon** in the add-ons:

   | F-Droid listing | Package ID | Needed? |
   |---|---|---|
   | **Termux** | `com.termux` | yes |
   | **Termux:API** | `com.termux.api` | only for battery temp / % / charging — **optional, see below** |
   | **Termux:Widget** | `com.termux.widget` | only for the tap-to-heat button (D8) |

   *Not* the Play Store — that build is abandoned.

   **If `Termux` does not appear in the F-Droid client's search:** the newest main-app build on F-Droid
   is a **pre-release** (`0.119.0-beta.3`), and F-Droid hides pre-release-only apps by default. Fix:
   *Settings → enable **Expert mode** → enable **Unstable updates***, then *Settings → Repositories* and
   pull down to refresh the index. Search again.

   **Guaranteed fallback:** download the APK directly from
   <https://f-droid.org/packages/com.termux/> (and `com.termux.api` if you want it). You lose update
   notifications, which does not matter this weekend.

   🔑 **All Termux apps must come from the same source.** F-Droid builds and GitHub builds are signed
   with different keys. Mix them and Android either refuses the install or `termux-battery-status`
   fails with a permission error that looks like a bug. Pick one source and use it for all of them.

2. **Install Tailscale** from the Play Store and sign in with the **same account** as the host.
   Confirm the host appears in its device list.
3. In Termux:
   ```sh
   pkg update && pkg install nodejs
   pkg install termux-api        # only if you installed the Termux:API app
   termux-battery-status         # only if you installed the Termux:API app
   ```
   **`nodejs` is the only required package.** Do not bother with `stress-ng` — it is not in Termux's
   default repo; `heat.js` replaces it (see *Making it fail on cue*).
   If you did install it, `termux-battery-status` must print JSON containing `"temperature"`.

   ### Termux:API is optional — you probably do not need it
   Only battery temperature, battery percentage and charging state come from Termux:API. Everything
   else the reporter sends is read straight from the filesystem and needs no add-on at all:
   CPU load (`/proc/stat`), SoC temperature (`/sys/class/thermal`), memory (`/proc/meminfo`) and the
   measured work rate.

   Since we are running **off-charger** and therefore using `VERIMESH_TEMP_SOURCE=soc` anyway, the
   reporter degrades cleanly without it: `batteryStatus()` returns null, battery/charging report as
   `—`, and temperature falls through to the SoC sensor. **If Termux:API turns into a rabbit hole,
   skip it and move on.**
4. **Stop Android killing it:** Settings → Apps → Termux → Battery → **Unrestricted**, then in the
   Termux session run `termux-wake-lock`.
5. **Pull the scripts straight off the host** — no cable, no git, no auth. Substitute the host's
   Tailscale address:
   ```sh
   HOST=http://100.x.y.z:3000
   curl -o report.js "$HOST/api/device/bootstrap?file=report.js"
   curl -o heat.js   "$HOST/api/device/bootstrap?file=heat.js"
   ```
   **If `curl` fails here, the network is the problem, not the phone** — go back to the table above.
   This is the cheapest possible connectivity test, so do it before anything else.
6. **Run the reporter:**
   ```sh
   export VERIMESH_INGEST_URL="$HOST/api/device/telemetry"
   export VERIMESH_DEVICE_TOKEN="<DEVICE_TOKEN from the host's .env.local>"
   node report.js
   ```
   One line per tick:
   ```
   #12  load 34%  batt 31.2C  soc 44.1C  using battery 31.2C  work 980  -> healthy
   ```
   The node turns **Live · Galaxy S22** in the console within ~2 seconds.

> If the ingest returns `404 unknown node`, run `POST /api/device/register` on the host first.

---

## Making it fail on cue (D8)

⚠️ **`stress-ng` is not in Termux's default repo** — `pkg install stress-ng` returns *unable to locate
package*. Do not chase it. **Use `heat.js` instead**, which needs nothing but the Node you already
installed for the reporter:

```sh
curl -o heat.js "$HOST/api/device/bootstrap?file=heat.js"
node heat.js 45 8        # 45 seconds, 8 workers (defaults to all cores)
```

It spawns one `worker_threads` worker per core running tight float math, so it saturates at native
JIT speed rather than at shell-loop speed. **Measured: 19.5 CPU-seconds consumed in 5 wall seconds
with 4 workers** — i.e. genuinely pegging every worker. Bounded, self-terminating, prints a countdown,
and handles Ctrl-C.

`stress.sh` is still there and now tries `stress-ng` → `heat.js` → shell workers in that order, so
either entry point works. Short bursts only — phones throttle themselves safely, and we do not need a
hot phone for long.

### 🔌 No cable also means no charging — so use the SoC sensor

The original plan assumed the phone was plugged in, because **charging plus CPU load** is what really
moves *battery* temperature. On battery alone, expect battery temp to climb only a few degrees
(~29 → 34 °C), which may never reach `T_max 41`.

The **SoC temperature** has no such problem: it swings from ~40 °C idle to 70 °C+ under load within
seconds, and it is just as real a sensor. The reporter can use it as the primary metric:

```sh
export VERIMESH_TEMP_SOURCE=soc     # battery (default) | soc | max
```

`max` uses whichever of the two is currently higher — a good default if you are unsure. Whatever it
picks is sent as `tempSource`, and the inspector's *Physical device* note **changes its wording to
name the sensor actually in use** ("the real SoC sensor from `/sys/class/thermal`"), so the narration
stays truthful either way.

Note that `/sys/class/thermal` is not always readable on a non-rooted S22. The reporter probes the
zones on first tick and prints `soc -` if none are accessible. **Check that line before committing to
`soc`** — if it is `-`, stay on `battery` and lower the bounds instead.

### Bounds — measure, then set

**Do this once the reporter is running, before rehearsing.** Watch the idle line for ~30 s, then run a
burst and watch the peak. Run it in a **second Termux session** (swipe from the left edge → *New
session*) so the reporter keeps printing while the phone heats:

```sh
node heat.js 45 8
```

Then set the bounds from what you actually saw, in the repo-root `.env.local`:

| Bound | Default | How to pick it |
|---|---|---|
| `DEVICE_T_WARN` | 37 | ~4–5 °C above the idle you measured |
| `DEVICE_T_MAX` | 41 | ~2–3 °C **below** the peak you measured, so the burst reliably crosses it |
| `DEVICE_L_MAX` | 0.85 | Leave it. `stress-ng --cpu 8` saturates the S22's 8 cores and crosses this immediately. |

Typical off-charger numbers: **battery source** → idle ~29, peak ~34, so `T_WARN 31` / `T_MAX 33`.
**SoC source** → idle ~40, peak ~75, so `T_WARN 50` / `T_MAX 60`. Restart the dev server after editing
`.env.local`.

Because `L_max` is crossed by the burst on its own, **the beat works even if the thermal numbers
disappoint** — load alone will drive the violation. The temperature is what makes it *narratively*
good, not what makes it function.

### Tap-to-heat (D8)

Install **Termux:Widget** from F-Droid, then:

```sh
mkdir -p ~/.shortcuts
printf '#!/data/data/com.termux/files/usr/bin/bash\ncd ~ && node heat.js 45 8\n' > ~/.shortcuts/heat-the-phone
chmod +x ~/.shortcuts/heat-the-phone
```

Add the Termux:Widget to the home screen and pick `heat-the-phone`. The demo beat becomes *tapping the
phone in your hand*.

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
