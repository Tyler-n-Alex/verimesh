import { NextResponse } from "next/server";
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const indexerUrl = process.env.ZEROG_INDEXER;
  if (!indexerUrl) {
    return NextResponse.json(
      { error: "ZEROG_INDEXER is not set in the repo-root .env.local" },
      { status: 503 }
    );
  }

  const root = new URL(request.url).searchParams.get("root");
  if (!root) {
    return NextResponse.json({ error: "root is required" }, { status: 400 });
  }

  const indexer = new Indexer(indexerUrl);
  const [blob, error] = await indexer.downloadToBlob(root, { proof: true });

  if (error || !blob) {
    return NextResponse.json(
      {
        error: `0G download failed: ${error?.message ?? "no blob returned"}`,
        root,
      },
      { status: 502 }
    );
  }

  const text = await blob.text();

  try {
    return new NextResponse(JSON.stringify(JSON.parse(text), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse(text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
