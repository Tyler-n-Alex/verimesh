# Device node — the Galaxy S22 as a real physical node

Owner: `@____` (Stream A) · Spec: base plan **§9E** · Board: [`BOARD.md`](BOARD.md) · Stream: [`STREAM-A.md`](STREAM-A.md)

**The claim this buys us:** one node in the mesh is not simulated. A Samsung Galaxy S22 reports its
own **real CPU utilisation** and **real battery temperature** into the mesh over its own network
link, and when you make it hot it genuinely crosses its own thermal bound, is genuinely detected,
and — because its neighbour belongs to a different operator — genuinely drives a **T2 cross-operator
quorum**. It kills the "it's just a simulation" objection, and because the *phone* is under load and
not the render laptop, it cannot make the 3D demo lag.

> ⚠️ **Narrate it precisely.** Battery temperature is a genuine sensor. **CPU load is not what it was
> originally specced to be** — on the S22 Ultra, Android denies `/proc/stat`, so the kernel's
> utilisation counter is unavailable and the reporter measures **scheduler contention** instead. That
> is a real kernel measurement (`run_delay` from `/proc/self/schedstat`), but it is *not* CPU
> utilisation: it registers the CPU being **oversubscribed**, not merely busy. Say "the phone is
> waiting for CPU", never "the phone is at 52% CPU". Throughput is a *measured work rate* (a fixed
> busy-loop timed each tick) — say "measured work rate", not "throughput sensor", and note that on a
> handset it tracks clock speed as much as contention, so it can *rise* under load when the governor
> boosts. The handset has no fan, so fan speed reads `—` rather than a fabricated number. **We
> deliberately do not apply the plan's `GAIN` multiplier**: the number on screen is the number that
> was measured. Overclaiming loses Q&A trust, and it is not needed — the phone crosses its own real
> bound on its own.
>
> The inspector rewords itself from `loadSource`, so what is on screen already names whichever
> mechanism was used. See **What this handset will not give up** below.

---

## Status — the handset is live and reporting

The S22 Ultra is attached and ticking into the live database over Tailscale. What remains is the
**tap-to-heat widget (D8)**, the **full-beat rehearsal (D9)** — which needs B's loop — and the
**venue check (D10)**.

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
- [x] **D7** **Phone setup on the actual S22** · done 23:10 · the handset is reporting live over
      Tailscale. Took far longer than 20m: Android denies `/proc/stat`, `/proc/loadavg`,
      `/proc/pressure/cpu` **and** `/sys/class/thermal` to unprivileged apps, so both of the sensors
      this task assumed were free had to be rebuilt. Load is now scheduler contention from
      `/proc/self/schedstat` over a 200ms window; temperature is battery-only and **no longer
      classifies at all**. Measured: idle ~0.08, burst peak **0.57** against `L_max 0.28`. See
      *What this handset will not give up*
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
3. In Termux — **`pkg upgrade`, not just `pkg update`**:
   ```sh
   pkg update && pkg upgrade -y
   pkg install nodejs
   node -v
   pkg install termux-api        # only if you installed the Termux:API app
   termux-battery-status         # only if you installed the Termux:API app
   ```
   🚨 **`pkg update` only refreshes the package index — it upgrades nothing.** If you install `nodejs`
   on top of an older `openssl`, Node is linked against a newer libcrypto than the one on the device
   and dies immediately with:
   ```
   CANNOT LINK EXECUTABLE "node": cannot locate symbol "OSSL_PROVIDER_add_conf_parameter"
   ```
   `pkg upgrade -y` is the fix. Always run it before `pkg install nodejs`, and confirm with `node -v`
   before moving on. See *Troubleshooting* for what to do if it persists.

   **`nodejs` is the only required package.** Do not bother with `stress-ng` — it is not in Termux's
   default repo; `heat.js` replaces it (see *Making it fail on cue*).
   If you did install it, `termux-battery-status` must print JSON containing `"temperature"`.

   ### Is Termux:API needed?
   **On the S22 Ultra, yes — it is not optional.** It is the only source of battery temperature,
   battery percentage and charging state, and because Android also denies `/sys/class/thermal` on this
   handset there is **no SoC sensor to fall back to**. Without Termux:API the node reports no
   temperature at all and the thermal half of the demo disappears. (The older advice here said you
   could skip it off-charger and fall through to the SoC sensor — that fallback does not exist on this
   device. See *What this handset will not give up*.)

   What genuinely needs no add-on: memory (`/proc/meminfo`), the measured work rate, and CPU
   contention (`/proc/self/schedstat`). Note that CPU **load** does *not* come from `/proc/stat` here —
   that path is denied.
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

## What this handset will not give up

Measured on the actual S22 Ultra with `services/device/probe.js`. **These are SELinux denials on
`untrusted_app`, not file permissions** — there is no Termux setting, package or flag that changes
them, and rooting is the only thing that would.

| Path | Result | Consequence |
|---|---|---|
| `/proc/stat` | `EACCES` | No kernel CPU utilisation. This is the big one. |
| `/proc/loadavg`, `/proc/uptime` | `EACCES` | No fallback there either. |
| `/proc/pressure/cpu` | `EACCES` | PSI would have been ideal; it is not available. |
| `/sys/class/thermal` | `EACCES` | **No SoC temperature at all.** `VERIMESH_TEMP_SOURCE=soc` and `max` are dead on this phone — battery is the only temperature it has. |
| `power_supply/current_now`, `voltage_now` | `EACCES` | Power always reads `—`. Do not claim it. |
| `/proc/self/schedstat` | ✅ readable | A process may always read its own. **This is what load is built on.** |
| `/proc/meminfo` | ✅ readable | Memory is real. |
| `termux-battery-status` | ✅ readable | Battery temp/%/charging. Times out under heavy load — see below. |
| `os.loadavg()` | readable but useless | Returns ~19–21 whether idle or saturated. libuv uses `sysinfo(2)`, so it dodges procfs, but the value has no discrimination. A dead end; do not chase it. |

### Why the probe window is 200ms

`run_delay` counts nanoseconds spent runnable but waiting for a CPU. How much accrues depends
enormously on how long we stay continuously runnable: a thread that just woke from a 2s sleep has low
vruntime, preempts the CPU hogs immediately, and is handed a core on demand. Sampled over a short
window it therefore reads ~0% **whether the phone is idle or on fire**.

Sweep from `probe.js`, idle vs `node heat.js 45 16`:

| window | idle | saturated |
|---|---|---|
| 10ms | 0.0% | 0.9% |
| 20ms | 1.9% | 0.4% |
| 50ms | 0.0% | 0.4% |
| 100ms | 0.0% | 36.3% |
| **200ms** | **0.1%** | **52.3%** |
| 400ms | 0.4% | 59.5% |
| 800ms | 0.1% | 63.7% |

The advantage runs out between 50 and 100ms. 200ms is the default: 52 points of separation, where
400ms buys 7 more for twice the cost. At 200ms per 2s tick the probe costs 10% of one core — about
1.25% of the phone — and reads 0.1% idle, so it does not manufacture the load it measures. Override
with `VERIMESH_PROBE_MS` if a different handset needs it.

### ⚠️ Worker count changes the reading

Contention measures *oversubscription*. `heat.js 45 8` puts 8 hogs on 8 cores and the reporter still
gets a core fairly easily; `heat.js 45 16` genuinely oversubscribes and is what produced 52.3%.
**Calibrate with the exact command the demo will run**, and prefer 16.

### ⚠️ Battery temperature drops out under a heavy burst

At 16 workers, `termux-battery-status` timed out (`ETIMEDOUT` at 5s) — Termux:API is starved along
with everything else. The reporter therefore polls battery on its own cadence and caches the last
good sample rather than blocking a tick on it, so ingest never stalls; the tick line marks the value
`(Ns old)` once it lags, and drops it to `—` past `VERIMESH_BATTERY_MAX_AGE_MS` (12s).

The practical consequence for the demo: **during a heavy burst the temperature may go stale exactly
when you want to point at it.** Battery temp decays slowly, so the reliable choreography is to let
the burst drive the *contention* violation, then stop it — the sensor comes back within a tick or
two and the elevated temperature is there to show. Rehearse it that way round.

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

### 🔌 Temperature: real, but **not** the trigger — measured, not assumed

`VERIMESH_TEMP_SOURCE` has only one usable setting on this handset: **`battery`**. `soc` and `max`
depend on `/sys/class/thermal`, which Android denies here, so there is no second sensor to fall back
to or take the max of.

**Earlier guidance in this doc claimed charging plus load would take battery temp "from ~29 °C past
41 °C in about a minute". That is not what happens.** Measured on the S22 Ultra:

| | measured |
|---|---|
| resting | ~33 °C (29.9 °C from cold) |
| after a 45s / 16-worker burst | **35.5 °C** |
| rise | **+2.5 °C**, gradually |
| fall afterwards | slower still — minutes, not visibly at all in the moment |

A battery has far too much thermal mass to swing on demand. So:

> **Contention is the trigger. Temperature is context.**

So temperature is **structurally excluded from classification**:

```
DEVICE_TEMP_GATES=false
DEVICE_T_WARN=36
DEVICE_T_MAX=40
```

`DEVICE_TEMP_GATES=false` makes `classifyDevice` ignore temperature entirely — it is measured,
stored, charted and narrated, but it cannot set status. The two bounds are still set above the
35.5 °C this handset reaches, so nothing depends on the flag alone.

This is deliberately a flag rather than just out-of-reach bounds. Bounds you have merely placed high
still trip on a hot day, in a warm venue, or after a longer burst than you rehearsed — and they would
trip into a state that takes minutes to clear. The flag cannot be surprised.

The node then returns to `healthy` the moment a burst ends, because contention resets in one tick
while the battery is still warm — which makes the demo **repeatable**, the property that matters most
when rehearsing or running it twice.

The UI reflects this without being told separately: the temperature sparkline drops its bound line,
its row reads *Temperature · not a trigger*, and the *Physical device* note says the sensor is shown
because it genuinely climbs but is not used to set status.

Temperature is still a genuine sensor and still worth pointing at. What you cannot say is that it
crossed a bound, because on this handset, in a demo-length window, it does not.

<details>
<summary>If you want temperature to trip anyway</summary>

Set `DEVICE_TEMP_GATES=true` and `DEVICE_T_MAX=35`. A burst will then cross it — but the battery
stays above 35 °C for **minutes** afterwards, so the node stays stuck in `violation` and the next run
cannot start from `healthy`. Acceptable for a single scripted run, bad for rehearsal. Do not choose
this without testing the cooldown you actually get in the room.

</details>

### 🐛 Why the bounds are sent with each reading

`NodeInspector` is a client component, and `DEVICE_T_WARN` / `DEVICE_T_MAX` / `DEVICE_L_MAX` are not
`NEXT_PUBLIC_` prefixed, so Next strips them from the browser bundle. Before this was fixed the
inspector silently fell back to the module defaults — it would have drawn `L_max 85%` and withheld
the red tint while the server was classifying against `0.28`. The ingest route now writes the bounds
it actually used into `nodes.metrics.bounds`, and the inspector prefers those, so the chart and the
status cannot disagree.

⚠️ **Keep bursts to 30–45 s regardless.** Sustained full-core load is not good for the battery, and
near ~45 °C Android throttles hard — which would stall the very effect being demonstrated.

Note `/sys/class/thermal` is not always readable on a non-rooted S22. The reporter probes the zones on
the first tick and prints `soc -` if none are accessible — so if you ever need the `soc` fallback,
check that line first.

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
| `DEVICE_TEMP_GATES` | true | **Set `false`.** Temperature stops classifying altogether while still being measured and shown. See *Temperature: real, but not the trigger*. |
| `DEVICE_T_WARN` | 37 | **Set 36** — above the 35.5 °C peak this handset reaches. Belt and braces alongside the flag. |
| `DEVICE_T_MAX` | 41 | **Set 40.** Same reason. Battery temp rises ~2.5 °C per burst and falls over minutes, so a bound it can cross is a bound it stays stuck above. |
| `DEVICE_L_MAX` | 0.85 | **Do not leave it at 0.85 when load source is `contention`.** That default assumes CPU utilisation, which saturates near 1.0. Measured from the running reporter on an S22 Ultra: **idle 0.08–0.10, burst 0.36–0.43 with 16 workers.** **Set 0.28** — violation clears the burst's floor by ~30%, and the warning band at 0.238 sits well above idle. Re-measure if you change the worker count. |

Restart the dev server after editing `.env.local` — bounds are read at startup.

Because `L_max` is crossed by the burst on its own, **the beat works even though the thermal numbers
disappoint** — contention alone drives the violation, and on this handset that is not a fallback but
the plan. The temperature is supporting colour, not the mechanism.

### Tap-to-heat (D8)

Install **Termux:Widget** from F-Droid, then:

```sh
mkdir -p ~/.shortcuts
printf '#!/data/data/com.termux/files/usr/bin/bash\ncd ~ && node heat.js 45 16\n' > ~/.shortcuts/heat-the-phone
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

## Troubleshooting — things that actually happened

**`CANNOT LINK EXECUTABLE "node": cannot locate symbol "OSSL_PROVIDER_add_conf_parameter"`**
A partially-upgraded package set: `nodejs` was built against a newer OpenSSL than the `openssl`
installed on the device. In order:
```sh
pkg upgrade -y                          # the fix in almost every case
pkg install --reinstall openssl nodejs  # force both into agreement
termux-change-repo                      # stale/inconsistent mirror; pick a nearer one, then pkg upgrade -y
pkg install nodejs-lts                  # last resort, a differently-built Node
```
Verify with `node -v` before doing anything else.

**`pkg install stress-ng` → unable to locate package**
Expected — it is not in Termux's default repo. Use `heat.js`.

**`curl` to the bootstrap URL hangs or refuses**
Network, not phone. In order: is the host running `pnpm --filter @verimesh/web dev`; is a consumer VPN
active on the host (disconnect it); was the firewall rule added; are phone and host on the same
Tailscale account; is the address the **host's** `100.x` and not some other machine's.

**Ingest returns `404 unknown node`**
Run `POST /api/device/register` on the host once.

**Ingest returns `401`**
`VERIMESH_DEVICE_TOKEN` on the phone must match `DEVICE_TOKEN` in the host's repo-root `.env.local`
exactly. The host reads it at startup, so restart the dev server after editing it.

**Node runs, reporter prints, but the console shows nothing**
Check the reporter's own output — it prints the ingest status per tick. If it prints `-> healthy` the
write is landing and the problem is the browser: confirm the console's top bar says
*Supabase Connected*.

**`soc -` in the reporter output**
`/sys/class/thermal` is not readable on this handset. Stay on `VERIMESH_TEMP_SOURCE=battery` and lower
`DEVICE_T_WARN`/`DEVICE_T_MAX` to match what battery temp actually reaches off-charger.

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
