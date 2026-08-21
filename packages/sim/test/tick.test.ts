import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { blueprint, type NodeMetrics } from "@verimesh/shared";
import { clearFaults, stampNow, tickOnce } from "../src/index";

interface Row {
  id: string;
  name: string;
  operator_id: string;
  x: number;
  y: number;
  z: number;
  kind: string;
  status: string;
  metrics: NodeMetrics;
  updated_at: string;
}

const BASELINE: Omit<NodeMetrics, "ts"> = {
  load: 0.42,
  temp: 46,
  throughput: 420,
  power: 210,
  mem: 0.38,
  fanRpm: 1960,
};

class FakeDb {
  nodes: Row[];
  edges: { id: number; from_node: string; to_node: string; weight: number }[];
  telemetry: Record<string, unknown>[] = [];
  onNodeRead?: () => void;
  writes = 0;
  refused = 0;

  constructor() {
    const source = blueprint as unknown as {
      nodes: { id: string; name: string; operator: string; pos: number[] }[];
      edges: { from: string; to: string; weight: number }[];
    };
    this.nodes = source.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      operator_id: n.operator,
      x: n.pos[0],
      y: n.pos[1],
      z: n.pos[2],
      kind: "sim",
      status: "healthy",
      metrics: { ts: 1_000, ...BASELINE },
      updated_at: "2026-01-01T00:00:00.000Z",
    }));
    this.edges = source.edges.map((e, i) => ({
      id: i,
      from_node: e.from,
      to_node: e.to,
      weight: e.weight,
    }));
  }

  node(id: string): Row | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  touch(id: string, patch: Partial<Row>, stamp: string): void {
    const row = this.node(id);
    if (!row) return;
    Object.assign(row, patch, { updated_at: stamp });
  }

  client(): SupabaseClient {
    const db = this;

    function builder(table: string) {
      const filters: [string, unknown][] = [];
      let mode: "select" | "update" | "insert" = "select";
      let payload: Record<string, unknown> = {};
      let returning = false;

      const settle = () => {
        if (table === "edges") return { data: db.edges, error: null };

        if (table === "telemetry") {
          db.telemetry.push(...(payload as unknown as Record<string, unknown>[]));
          return { data: null, error: null };
        }

        if (mode === "select") {
          const snapshot = db.nodes
            .filter((n) => n.kind !== "device")
            .map((n) => ({ ...n, metrics: { ...n.metrics } }));
          if (db.onNodeRead) db.onNodeRead();
          return { data: snapshot, error: null };
        }

        const matched = db.nodes.filter((n) =>
          filters.every(([column, value]) =>
            column === "id" ? n.id === value : n.updated_at === value
          )
        );

        if (matched.length === 0) db.refused += 1;

        for (const row of matched) {
          Object.assign(row, payload);
          db.writes += 1;
        }

        return {
          data: returning ? matched.map((n) => ({ id: n.id })) : null,
          error: null,
        };
      }

      const api: Record<string, unknown> = {
        select(_columns?: string) {
          if (mode === "update") returning = true;
          return api;
        },
        update(values: Record<string, unknown>) {
          mode = "update";
          payload = values;
          return api;
        },
        insert(values: Record<string, unknown>) {
          mode = "insert";
          payload = values;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return api;
        },
        neq() {
          return api;
        },
        order() {
          return api;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(settle()).then(resolve);
        },
      };

      return api;
    }

    return { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  }
}

describe("C2.4 · the simulator advances the mesh without stepping on anyone", () => {
  it("stamps telemetry with the wall clock, not a step counter", async () => {
    clearFaults();
    const db = new FakeDb();
    const before = Date.now();
    const tick = await tickOnce(db.client());
    const after = Date.now();

    expect(tick.written.length).toBeGreaterThan(0);
    for (const node of tick.state.nodes) {
      expect(node.metrics.ts).toBeGreaterThanOrEqual(before);
      expect(node.metrics.ts).toBeLessThanOrEqual(after);
    }
    for (const row of db.telemetry) {
      expect(Number(row.ts)).toBeGreaterThanOrEqual(before);
    }
  });

  it("leaves a node alone when an injection lands between its read and its write", async () => {
    clearFaults();
    const db = new FakeDb();
    let injected = false;

    db.onNodeRead = () => {
      if (injected) return;
      injected = true;
      db.touch(
        "node-07",
        {
          status: "warning",
          metrics: { ts: 5_000, ...BASELINE, load: 0.88, temp: 78, power: 301 },
        },
        "2026-02-02T00:00:00.000Z"
      );
    };

    const tick = await tickOnce(db.client());

    expect(tick.skipped).toEqual(["node-07"]);
    expect(tick.written).not.toContain("node-07");

    const node = db.node("node-07")!;
    expect(node.status).toBe("warning");
    expect(node.metrics.load).toBe(0.88);
    expect(node.metrics.power).toBe(301);
    expect(node.metrics.temp).toBe(78);

    expect(db.telemetry.some((row) => row.node_id === "node-07")).toBe(false);
    expect(db.telemetry.length).toBe(tick.written.length);
  });

  it("carries the fault forward on the next tick instead of dropping it", async () => {
    clearFaults();
    const db = new FakeDb();
    let injected = false;

    db.onNodeRead = () => {
      if (injected) return;
      injected = true;
      db.touch(
        "node-07",
        {
          status: "warning",
          metrics: { ts: 5_000, ...BASELINE, load: 0.88, temp: 78, power: 301 },
        },
        "2026-02-02T00:00:00.000Z"
      );
    };

    await tickOnce(db.client());
    const second = await tickOnce(db.client());

    expect(second.skipped).toEqual([]);
    const node = db.node("node-07")!;
    expect(node.metrics.load).toBe(0.88);
    expect(node.metrics.power).toBe(301);
    expect(node.metrics.temp).toBeGreaterThan(78);
  });

  it("writes every node again once nothing is racing it", async () => {
    clearFaults();
    const db = new FakeDb();
    const first = await tickOnce(db.client());
    const second = await tickOnce(db.client());

    expect(first.skipped).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(second.written.length).toBe(db.nodes.filter((n) => n.kind !== "device").length);
  });

  it("stamps a state passed through stampNow and leaves the rest alone", () => {
    const stamped = stampNow(
      {
        nodes: [
          {
            id: "node-00",
            name: "Rig-00",
            operator: "opC",
            pos: [0, 0, 0],
            status: "healthy",
            metrics: { ts: 1, ...BASELINE },
          },
        ],
        edges: [],
      },
      99_999
    );

    expect(stamped.nodes[0].metrics.ts).toBe(99_999);
    expect(stamped.nodes[0].metrics.load).toBe(BASELINE.load);
  });
});
