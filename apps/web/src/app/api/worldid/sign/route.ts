import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";

export const dynamic = "force-dynamic";

export async function POST() {
  const signingKeyHex = process.env.WORLDID_SIGNING_KEY;
  const rpId = process.env.WORLDID_RP_ID;
  const appId = process.env.NEXT_PUBLIC_WORLDID_APP_ID;
  const action = process.env.WORLDID_ACTION ?? "verimesh-authorize";

  const missing = [
    !signingKeyHex && "WORLDID_SIGNING_KEY",
    !rpId && "WORLDID_RP_ID",
    !appId && "NEXT_PUBLIC_WORLDID_APP_ID",
  ].filter(Boolean);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `missing ${missing.join(", ")} in the repo-root .env.local`,
        configured: false,
      },
      { status: 503 }
    );
  }

  try {
    const sig = signRequest({ signingKeyHex: signingKeyHex as string, action });

    return NextResponse.json(
      {
        configured: true,
        app_id: appId,
        action,
        rp_context: {
          rp_id: rpId as string,
          nonce: sig.nonce,
          created_at: sig.createdAt,
          expires_at: sig.expiresAt,
          signature: sig.sig,
        },
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `signRequest failed: ${message}`, configured: true },
      { status: 500 }
    );
  }
}
