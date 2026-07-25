---
name: world-id
description: World ID v4 / IDKit 4.x integration for Verimesh — the differential-authorization gate (T0/T1/T2), nullifier-based distinct-human quorum, RP signing, and backend proof verification. Use for any task touching World ID, IDKit, nullifiers, human approval, the freeze modal, or authz tiers.
---

# World ID — Verimesh differential authorization

Covers plan §1D, §9 B5, §8 A3.6. Tasks `B5.*`, `A3.6.*`, `C3.*`, `C4.2`.

> **Docs verified 2026-07-25** against <https://docs.world.org/world-id/idkit/integrate>.
> World ID **4.0 changed the integration substantially**. If something here fights the SDK,
> re-read the live docs and **update this file** — do not work around it silently.

## ⚠️ The plan is out of date on this

`IMPLEMENTATION_PLAN_THEGRAPH.md` §5 and §9 B5 say to use **`verifyCloudProof`**. That is the
**v3** API. In v4 it is replaced by a POST to the Developer Portal:

```
POST https://developer.world.org/api/v4/verify/{rp_id}
```

Two more v4 changes that will bite:
- The widget **cannot open without a valid `rp_context`** — a short-lived, backend-signed token.
  There is no "just render the widget" path any more. The backend route is a hard dependency of
  the frontend, so **B5.1 must land before A3.6.1**.
- The uniqueness field is **`nullifier`**, not `nullifier_hash`. It arrives as hex
  (`"0x04e5f6..."`). The docs say to **convert to decimal before persisting**. Pick one
  representation, write it into `packages/shared`, and use it everywhere — our whole quorum
  distinctness check is string equality on this value. Mixing hex and decimal silently breaks T2
  by making one human look like two.

## Packages

| Package | Where |
|---|---|
| `@worldcoin/idkit` (4.x) | React widget — `apps/web` |
| `@worldcoin/idkit-core` (4.x) | Types |
| `@worldcoin/idkit-core/signing` | `signRequest` — **backend only** |

## Backend — RP context signing

`process.env.WORLDID_SIGNING_KEY` is already in `.env.example`. It **never** reaches the client.

```ts
import { signRequest } from "@worldcoin/idkit-core/signing";

export async function POST() {
  const action = process.env.WORLDID_ACTION!;
  const sig = signRequest({
    signingKeyHex: process.env.WORLDID_SIGNING_KEY!,
    action,
  });

  return Response.json({
    rp_id: process.env.WORLDID_RP_ID!,
    nonce: sig.nonce,
    created_at: sig.created_at,
    expires_at: sig.expires_at,
    signature: sig.sig,
  });
}
```

The signed context is short-lived. Fetch it when the freeze modal opens, not at page load — a
context minted at boot will be expired by the time a judge scans.

## Backend — proof verification

```ts
export async function POST(req: Request) {
  const { rp_id, idkitResponse } = await req.json();

  const res = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });

  if (!res.ok) return Response.json({ ok: false }, { status: 400 });

  const verified = await res.json();
  return Response.json({ ok: true, nullifier: verified.nullifier });
}
```

Never trust a proof the client says is valid. The nullifier we record must come from **our**
verification call, not from the widget payload the browser handed us.

## Frontend — the widget

```tsx
import { IDKitRequestWidget, orbLegacy } from "@worldcoin/idkit";

<IDKitRequestWidget
  open={open}
  onOpenChange={setOpen}
  app_id={process.env.NEXT_PUBLIC_WORLDID_APP_ID!}
  action="verimesh-authorize"
  rp_context={rpContext}
  allow_legacy_proofs={true}
  preset={orbLegacy({ signal: gateId })}
  handleVerify={async (result) => {
    const res = await fetch("/api/worldid/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rp_id: rpContext.rp_id, idkitResponse: result }),
    });
    if (!res.ok) throw new Error("verification failed");
  }}
  onSuccess={() => refreshGate()}
/>
```

Set `signal` to the **gate id**. It binds the proof to this specific freeze — without it a proof
from an earlier gate can be replayed into a later one.

## The Verimesh-specific part — differential authorization

The World track asks for *"human-backed agents receiving differential access or authorization."*
A single scan that unlocks everything is a login and scores nothing. Our answer is `authz.ts`
(C-owned, pure, property-tested):

| Tier | Trigger | Requirement |
|---|---|---|
| `T0_AUTONOMOUS` | VERIFIED, in-envelope, single operator | agent acts alone |
| `T1_SINGLE` | VIOLATION or `ISOLATE_NODE`, confined to one operator | 1 human on that operator's allowlist |
| `T2_QUORUM` | projected effect crosses into another operator's nodes | **2 distinct** nullifiers, one per affected operator |

**Why the nullifier is load-bearing, and a wallet is not:** anyone can mint 100 wallets; nobody
can mint 100 verified humans. T2 is only meaningful because proof-of-personhood makes
"two different people" enforceable. Say this at the booth.

Three rules the implementation must not violate:

1. **Distinctness is checked twice.** The gate rejects a repeat nullifier, *and*
   `resolveOverride` on the registry contract reverts on a duplicate. Backend logic can be
   fooled; the chain call cannot. Both, not either.
2. **Personhood ≠ authority.** World ID proves *a* unique human. `authz_config.json` maps
   operator → enrolled nullifier(s) and proves *which*. T1 and T2 check both.
3. **`authz.ts` stays pure.** Budget counts and incident counts are **arguments**, supplied by B
   from a plain GraphQL query (`B5.7`) — never fetched inside the policy. That is what keeps it
   property-testable under `fast-check` (`C4.2`).

## Booth-critical setup — do this early

T2 needs **two World ID identities present at the demo**: two phones, or one phone plus the
**World ID Simulator** for the second. Both must be pre-enrolled in `authz_config.json`, one per
operator. This is task `B5.6`. A team that discovers at 04:00 that it only has one identity
cannot demo the quorum — which is the single strongest World moment we have.

## Env

```
NEXT_PUBLIC_WORLDID_APP_ID=
WORLDID_RP_ID=
WORLDID_SIGNING_KEY=
WORLDID_ACTION=verimesh-authorize
```

## Repo rules

No comments in source files (`CLAUDE.md`). The snippets above are comment-free — keep them that
way when you copy them.

## Sources

- IDKit integration — <https://docs.world.org/world-id/idkit/integrate>
- idkit-js — <https://github.com/worldcoin/idkit-js>
- Cloud template (v3-era, read with care) — <https://github.com/worldcoin/world-id-cloud-template>
