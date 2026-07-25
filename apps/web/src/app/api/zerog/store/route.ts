import { NextResponse } from "next/server";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { normalizeNullifier } from "@verimesh/shared";
import { ADMIN_MISSING, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { ReasoningBlob } from "@/lib/zerog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface StoreBody {
  proposalId?: number;
}

export async function POST(request: Request) {
  const rpc = process.env.ZEROG_RPC;
  const indexerUrl = process.env.ZEROG_INDEXER;
  const privateKey = process.env.ZEROG_PRIVATE_KEY;

  const missing = [
    !rpc && "ZEROG_RPC",
    !indexerUrl && "ZEROG_INDEXER",
    !privateKey && "ZEROG_PRIVATE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `missing ${missing.join(", ")} in the repo-root .env.local` },
      { status: 503 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: ADMIN_MISSING }, { status: 500 });
  }

  let body: StoreBody;
  try {
    body = (await request.json()) as StoreBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const proposalId = body.proposalId;
  if (proposalId === undefined || proposalId === null) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }

  const { data: proposal, error: proposalError } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalError) {
    return NextResponse.json({ error: proposalError.message }, { status: 500 });
  }
  if (!proposal) {
    return NextResponse.json(
      { error: `unknown proposal ${proposalId}` },
      { status: 404 }
    );
  }

  const [{ data: verdict }, { data: gate }, { data: node }] = await Promise.all([
    supabase.from("verdicts").select("*").eq("proposal_id", proposalId).maybeSingle(),
    supabase.from("human_gates").select("*").eq("proposal_id", proposalId).maybeSingle(),
    proposal.node_id
      ? supabase.from("nodes").select("*").eq("id", proposal.node_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: approvals } = gate
    ? await supabase
        .from("human_approvals")
        .select("nullifier,operator,ts")
        .eq("gate_id", gate.id)
        .order("ts", { ascending: true })
    : { data: [] as { nullifier: string; operator: string; ts: number }[] };

  const { data: telemetry } = proposal.node_id
    ? await supabase
        .from("telemetry")
        .select("*")
        .eq("node_id", proposal.node_id)
        .order("ts", { ascending: false })
        .limit(30)
    : { data: [] };

  const { data: historyEvent } = proposal.node_id
    ? await supabase
        .from("events")
        .select("message,ts")
        .eq("node_id", proposal.node_id)
        .ilike("type", "%history%")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const blob: ReasoningBlob = {
    version: 1,
    decision: {
      proposalId,
      nodeId: proposal.node_id ?? null,
      operator: node?.operator_id ?? null,
      ts: Number(proposal.ts),
    },
    telemetry: telemetry ?? [],
    citedHistory: historyEvent?.message ?? null,
    proposal,
    verdict: verdict ?? null,
    authorization: {
      tier: gate?.required_tier ?? proposal.auth_tier ?? null,
      requiredQuorum: gate?.required_quorum ?? null,
      operatorsRequired: gate?.operators_required ?? [],
      reason: gate?.reason ?? null,
      approvals: (approvals ?? []).map((a) => ({
        nullifier: safeNullifier(a.nullifier),
        operator: a.operator,
        ts: Number(a.ts),
      })),
    },
  };

  const payload = new TextEncoder().encode(JSON.stringify(blob, null, 2));
  const file = new MemData(payload);

  const [tree, treeError] = await file.merkleTree();
  if (treeError || !tree) {
    return NextResponse.json(
      { error: `merkleTree failed: ${treeError?.message ?? "no tree"}` },
      { status: 500 }
    );
  }

  const rootHash = tree.rootHash();
  if (!rootHash) {
    return NextResponse.json({ error: "merkle tree produced no root" }, { status: 500 });
  }

  const provider = new ethers.JsonRpcProvider(rpc as string);
  const signer = new ethers.Wallet(privateKey as string, provider);
  const indexer = new Indexer(indexerUrl as string);

  const [uploadResult, uploadError] = await indexer.upload(
    file,
    rpc as string,
    signer
  );

  if (uploadError) {
    return NextResponse.json(
      { error: `0G upload failed: ${uploadError.message}`, rootHash },
      { status: 502 }
    );
  }

  const storedRoot =
    "rootHash" in uploadResult ? uploadResult.rootHash : uploadResult.rootHashes[0];
  const storageTx =
    "txHash" in uploadResult ? uploadResult.txHash : uploadResult.txHashes[0];

  const finalRoot = storedRoot ?? rootHash;

  const { data: existingCommit } = await supabase
    .from("commits")
    .select("id")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (existingCommit) {
    await supabase
      .from("commits")
      .update({ zerog_root: finalRoot })
      .eq("id", existingCommit.id);
  } else {
    await supabase.from("commits").insert({
      proposal_id: proposalId,
      applied_action: proposal.proposed_action,
      zerog_root: finalRoot,
      ts: Date.now(),
      auth_tier: blob.authorization.tier,
      human_authorized: blob.authorization.approvals.length > 0,
    });
  }

  await supabase.from("proposals").update({ zerog_root: finalRoot }).eq("id", proposalId);

  await supabase.from("events").insert({
    ts: Date.now(),
    type: "storage",
    node_id: proposal.node_id ?? null,
    message: `reasoning blob stored on 0G — root ${finalRoot}`,
  });

  return NextResponse.json({
    ok: true,
    rootHash: finalRoot,
    storageTx,
    bytes: payload.byteLength,
  });
}

function safeNullifier(value: string): string {
  try {
    return normalizeNullifier(value);
  } catch {
    return value;
  }
}
