import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { authorizeDevice } from "@/lib/device";

// Dev-only diagnostic sink. The handset has a proven outbound path to this host
// (that is how telemetry lands), but no easy way to get terminal output back off
// the phone. This accepts a text blob and drops it in a temp file so it can be
// read on the host. Never enabled in production, token-gated, size-capped, and
// the filename is sanitised rather than taken from the caller verbatim.

export const dynamic = "force-dynamic";

const MAX_BYTES = 256 * 1024;

// Not exported: a route module may only export the request handlers and a
// fixed set of config keys, and anything else fails the generated type check.
const PASTE_DIR = path.join(os.tmpdir(), "verimesh-paste");

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const denied = authorizeDevice(request);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 });
  }

  const body = await request.text();
  if (body.length === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }
  if (body.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `body too large (${body.length} > ${MAX_BYTES} bytes)` },
      { status: 413 }
    );
  }

  const requested = new URL(request.url).searchParams.get("name") ?? "paste";
  const safe =
    requested.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60) || "paste";

  await mkdir(PASTE_DIR, { recursive: true });
  const target = path.join(PASTE_DIR, `${safe}.txt`);
  await writeFile(target, body, "utf8");

  return NextResponse.json({ ok: true, bytes: body.length, saved: target });
}
