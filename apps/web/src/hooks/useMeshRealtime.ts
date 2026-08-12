"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured, SUPABASE_MISSING_HINT } from "@/lib/supabase";
import { useMeshStore } from "@/store/mesh";
import type {
  ApprovalRow,
  CommitRow,
  EdgeRow,
  EventRow,
  GateRow,
  NodeRow,
  ProposalRow,
  TelemetryRow,
  VerdictRow,
} from "@/lib/db";

const COMMIT_POLL_MS = 4000;
const TELEMETRY_LIMIT = 1200;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const shaped = err as { message?: unknown; code?: unknown };
    if (typeof shaped.message === "string" && shaped.message.length > 0) {
      return typeof shaped.code === "string" && shaped.code.length > 0
        ? `${shaped.message} (${shaped.code})`
        : shaped.message;
    }
  }
  return String(err);
}

export function useMeshRealtime(): void {
  useEffect(() => {
    const store = useMeshStore.getState();

    if (!supabaseConfigured) {
      store.setLink("error", SUPABASE_MISSING_HINT);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      store.setLink("error", SUPABASE_MISSING_HINT);
      return;
    }

    let cancelled = false;
    store.setLink("connecting");

    async function loadInitial() {
      const [
        nodes,
        edges,
        events,
        proposals,
        verdicts,
        commits,
        gates,
        approvals,
        telemetry,
      ] = await Promise.all([
        supabase!.from("nodes").select("*"),
        supabase!.from("edges").select("*"),
        supabase!.from("events").select("*").order("ts", { ascending: false }).limit(400),
        supabase!.from("proposals").select("*").order("ts", { ascending: false }).limit(60),
        supabase!.from("verdicts").select("*").order("ts", { ascending: false }).limit(120),
        supabase!.from("commits").select("*").order("ts", { ascending: false }).limit(120),
        supabase!.from("human_gates").select("*").order("ts", { ascending: false }).limit(40),
        supabase!.from("human_approvals").select("*").order("ts", { ascending: true }).limit(200),
        supabase!
          .from("telemetry")
          .select("*")
          .order("ts", { ascending: false })
          .limit(TELEMETRY_LIMIT),
      ]);

      const coreError =
        nodes.error ??
        edges.error ??
        events.error ??
        proposals.error ??
        verdicts.error ??
        commits.error ??
        gates.error ??
        approvals.error;

      if (coreError) throw coreError;
      if (cancelled) return;

      if (telemetry.error) {
        console.warn(
          `[verimesh] telemetry unavailable, charts will be empty: ${errorMessage(telemetry.error)}`
        );
      }

      useMeshStore.getState().hydrate({
        nodes: (nodes.data ?? []) as NodeRow[],
        edges: (edges.data ?? []) as EdgeRow[],
        events: (events.data ?? []) as EventRow[],
        proposals: (proposals.data ?? []) as ProposalRow[],
        verdicts: (verdicts.data ?? []) as VerdictRow[],
        commits: (commits.data ?? []) as CommitRow[],
        gates: (gates.data ?? []) as GateRow[],
        approvals: (approvals.data ?? []) as ApprovalRow[],
        telemetry: (telemetry.data ?? []) as TelemetryRow[],
      });
    }

    const channel = supabase
      .channel("verimesh-mesh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nodes" },
        (payload: RealtimePostgresChangesPayload<NodeRow>) => {
          const s = useMeshStore.getState();
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<NodeRow>;
            if (old?.id) s.removeNode(old.id);
            return;
          }
          s.upsertNode(payload.new as NodeRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        (payload: RealtimePostgresChangesPayload<EventRow>) => {
          if (payload.eventType === "DELETE") return;
          useMeshStore.getState().pushEvent(payload.new as EventRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proposals" },
        (payload: RealtimePostgresChangesPayload<ProposalRow>) => {
          if (payload.eventType === "DELETE") return;
          useMeshStore.getState().upsertProposal(payload.new as ProposalRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "verdicts" },
        (payload: RealtimePostgresChangesPayload<VerdictRow>) => {
          if (payload.eventType === "DELETE") return;
          useMeshStore.getState().upsertVerdict(payload.new as VerdictRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "human_gates" },
        (payload: RealtimePostgresChangesPayload<GateRow>) => {
          if (payload.eventType === "DELETE") return;
          useMeshStore.getState().upsertGate(payload.new as GateRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "human_approvals" },
        (payload: RealtimePostgresChangesPayload<ApprovalRow>) => {
          if (payload.eventType === "DELETE") return;
          useMeshStore.getState().upsertApproval(payload.new as ApprovalRow);
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        const s = useMeshStore.getState();
        if (status === "SUBSCRIBED") s.setLink("live");
        else if (status === "CHANNEL_ERROR")
          s.setLink("error", "realtime channel error");
        else if (status === "TIMED_OUT")
          s.setLink("error", "realtime subscription timed out");
        else if (status === "CLOSED" && s.link === "live") s.setLink("idle");
      });

    loadInitial().catch((err: unknown) => {
      if (cancelled) return;
      useMeshStore.getState().setLink("error", errorMessage(err));
    });

    const commitTimer = window.setInterval(() => {
      void supabase
        .from("commits")
        .select("*")
        .order("ts", { ascending: false })
        .limit(120)
        .then(({ data, error }) => {
          if (cancelled || error || !data) return;
          useMeshStore.getState().setCommits(data as CommitRow[]);
        });
    }, COMMIT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(commitTimer);
      void supabase.removeChannel(channel);
    };
  }, []);
}
