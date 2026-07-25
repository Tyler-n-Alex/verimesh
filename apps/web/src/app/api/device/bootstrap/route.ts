import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["report.js", "stress.sh", "fake-phone.js"]);

export async function GET(request: Request) {
  const requested =
    new URL(request.url).searchParams.get("file") ?? "report.js";

  if (!ALLOWED.has(requested)) {
    return NextResponse.json(
      { error: `unknown file; allowed: ${[...ALLOWED].join(", ")}` },
      { status: 404 }
    );
  }

  const target = path.join(process.cwd(), "..", "..", "services", "device", requested);

  try {
    const body = await readFile(target, "utf8");
    return new NextResponse(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `could not read ${requested}: ${message}` },
      { status: 500 }
    );
  }
}
