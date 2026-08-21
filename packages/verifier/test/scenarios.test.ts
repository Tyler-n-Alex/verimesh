import { describe, expect, it } from "vitest";
import {
  REPEAT_OFFENDER_INCIDENTS,
  authzConfig,
  boundsFor,
  equilibriumTemp,
  requireAuthorization,
  step,
  throttleFactor,
  type AuthzConfig,
  type GridState,
  type HistoryEntry,
} from "@verimesh/shared";
import { heuristicProposal } from "@verimesh/chain/heuristic";
import {
  SCENARIOS,
  affectedOperators,
  checkHistory,
  detectAnomalies,
  detectAnomaly,
  pickHistoryNode,
  readSignature,
  relocate,
  resolveScenario,
  scenarioById,
  verifyConstraints,
  type Scenario,
} from "../src/index";

const HORIZON_TICKS = 30;
const CONFIG = authzConfig as AuthzConfig;

function historyFor(nodeId: string, count: number): HistoryEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    nodeId,
    operator: "opA",
    action: "THROTTLE_NODE",
    verdict: "VERIFIED",
    outcome: i % 2 === 0 ? "autonomous" : "human_authorized",
    ts: 1_000 + i,
  }));
}

function observationFor(
  state: GridState,
  nodeId: string,
  history: HistoryEntry[]
) {
  const neighbours = new Set([nodeId]);
  for (const edge of state.edges) {
    if (edge.from === nodeId) neighbours.add(edge.to);
    if (edge.to === nodeId) neighbours.add(edge.from);
  }

  const node = state.nodes.find((n) => n.id === nodeId)!;

  return {
    observation_id: "test",
    telemetry_window: [
      {
        node_id: nodeId,
        ts: node.metrics.ts,
        load: node.metrics.load,
        temp: node.metrics.temp,
        throughput: node.metrics.throughput,
        power: node.metrics.power,
      },
    ],
    topology: {
      nodes: state.nodes.filter((n) => neighbours.has(n.id)),
      edges: state.edges.filter(
        (e) => neighbours.has(e.from) || neighbours.has(e.to)
      ),
    },
    history_window: history,
  };
}

function advance(state: GridState, ticks: number): GridState {
  let current = state;
  for (let i = 0; i < ticks; i++) current = step(current);
  return current;
}

describe("C2.4 · the injected state is physically self-consistent", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} writes metrics the physics could have produced`, () => {
      const state = scenario.state();

      for (const node of state.nodes) {
        const bounds = boundsFor(node.id);
        if (!bounds) continue;
        const nominal = bounds.nominalThroughput * node.metrics.load;
        expect(node.metrics.throughput).toBeLessThanOrEqual(nominal + 1e-9);
        expect(node.metrics.throughput).toBeGreaterThanOrEqual(0);
      }

      for (const node of state.nodes) {
        const bounds = boundsFor(node.id);
        if (!bounds) continue;
        if (node.status === "offline" || node.status === "isolated") continue;
        expect(node.metrics.throughput).toBeCloseTo(
          bounds.nominalThroughput *
            node.metrics.load *
            throttleFactor(node.metrics.temp, bounds.tempWarn),
          6
        );
      }
    });
  }
});

describe("C2.4 · every scenario drives its node past the ceiling and holds it", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} keeps ${scenario.anomalyNode} over its ceiling for the whole horizon`, () => {
      const bounds = boundsFor(scenario.anomalyNode)!;
      let state = scenario.state();

      const start = readSignature(state, scenario.anomalyNode)!;
      expect(start.overWarn).toBe(true);
      expect(start.headedOverCeiling).toBe(true);

      for (let tick = 0; tick < HORIZON_TICKS; tick++) {
        state = step(state);
        const signature = readSignature(state, scenario.anomalyNode)!;
        expect(signature.overWarn).toBe(true);
        expect(signature.headedOverCeiling).toBe(true);
      }

      const settled = readSignature(state, scenario.anomalyNode)!;
      expect(settled.temp).toBeGreaterThan(bounds.tempCeiling);
      expect(settled.power).toBeLessThanOrEqual(bounds.powerCeiling);
    });
  }
});

describe("C2.4 · detection fires on the intended node, and only that node", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} is detected on ${scenario.anomalyNode} from the first tick`, () => {
      let state = scenario.state();

      for (let tick = 0; tick <= HORIZON_TICKS; tick++) {
        const detection = detectAnomaly(state);
        expect(detection.kind).toBe("anomaly");
        if (detection.kind === "anomaly") {
          expect(detection.nodeId).toBe(scenario.anomalyNode);
        }
        state = step(state);
      }
    });

    it(`${scenario.id} leaves every other node inside its bounds`, () => {
      const state = advance(scenario.state(), HORIZON_TICKS);

      for (const node of state.nodes) {
        if (node.id === scenario.anomalyNode) continue;
        const signature = readSignature(state, node.id);
        if (!signature) continue;
        expect(signature.headedOverCeiling).toBe(false);
        expect(signature.overCeiling).toBe(false);
      }
    });
  }

  it("picks the worst node when more than one is anomalous, not whichever came back first", () => {
    const cascade = scenarioById("ambiguous_cascade")!.state();
    const benign = scenarioById("benign_spike")!.state();

    const merged: GridState = {
      edges: cascade.edges,
      nodes: cascade.nodes.map((node) => {
        const other = benign.nodes.find((n) => n.id === node.id)!;
        return node.id === "node-02" ? other : node;
      }),
    };

    const forward = detectAnomaly(merged);
    const reversed = detectAnomaly({
      edges: merged.edges,
      nodes: [...merged.nodes].reverse(),
    });

    expect(forward.kind).toBe("anomaly");
    expect(reversed).toEqual(forward);
  });
});

describe("C2.4 · detection ranks every anomaly so a settling node cannot starve the rest", () => {
  it("returns each anomalous node once, worst first", () => {
    const cascade = scenarioById("ambiguous_cascade")!.state();
    const benign = scenarioById("benign_spike")!.state();

    const merged: GridState = {
      edges: cascade.edges,
      nodes: cascade.nodes.map((node) =>
        node.id === "node-02"
          ? benign.nodes.find((n) => n.id === "node-02")!
          : node
      ),
    };

    const ranked = detectAnomalies(merged);
    const ids = ranked.map((r) => r.nodeId);

    expect(ids).toContain("node-07");
    expect(ids).toContain("node-02");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ranked[0]).toEqual(detectAnomaly(merged));
  });

  it("is empty on a mesh with nothing wrong", () => {
    const state = SCENARIOS[0].state();
    const healthy: GridState = {
      ...state,
      nodes: state.nodes.map((node) => ({
        ...node,
        status: "healthy" as const,
        metrics: { ...node.metrics, load: 0.42, temp: 46, power: 210, throughput: 420 },
      })),
    };
    expect(detectAnomalies(healthy)).toEqual([]);
  });
});

describe("C2.4 · the signature discriminates the scenarios from each other", () => {
  it("only the cascade has lost a neighbour", () => {
    for (const scenario of SCENARIOS) {
      const signature = readSignature(scenario.state(), scenario.anomalyNode)!;
      const expected = scenario.id === "ambiguous_cascade";
      expect(signature.offlineNeighbours.length > 0).toBe(expected);
    }
  });

  it("every scenario shows throughput already falling under its nominal", () => {
    for (const scenario of SCENARIOS) {
      const signature = readSignature(scenario.state(), scenario.anomalyNode)!;
      expect(signature.degradedThroughput).toBe(true);
    }
  });
});

describe("C2.4 · the fallback proposer reads the signature it is given", () => {
  it("isolates on the cascade, because a neighbour is already gone", () => {
    const scenario = scenarioById("ambiguous_cascade")!;
    const state = scenario.state();
    const proposal = heuristicProposal(
      observationFor(state, scenario.anomalyNode, historyFor(scenario.anomalyNode, 4))
    );

    expect(proposal.proposed_action).toBe("ISOLATE_NODE");
    expect(proposal.target_nodes).toEqual([scenario.anomalyNode]);
    expect(proposal.risk_flags).toContain("neighbour_offline");
  });

  it("throttles the benign spike, because nothing was lost", () => {
    const scenario = scenarioById("benign_spike")!;
    const state = scenario.state();
    const proposal = heuristicProposal(
      observationFor(state, scenario.anomalyNode, [])
    );

    expect(proposal.proposed_action).toBe("THROTTLE_NODE");
    expect(proposal.confidence).toBeGreaterThanOrEqual(0.75);
    expect(proposal.risk_flags).toEqual([]);
  });

  it("throttles the recurring fault too, and says why it is a repeat", () => {
    const scenario = scenarioById("recurring_fault")!;
    const state = scenario.state();
    const proposal = heuristicProposal(
      observationFor(
        state,
        scenario.anomalyNode,
        historyFor(scenario.anomalyNode, REPEAT_OFFENDER_INCIDENTS)
      )
    );

    expect(proposal.proposed_action).toBe("THROTTLE_NODE");
    expect(proposal.risk_flags).toContain("repeat_offender");
  });

  it("gives the same answer for the benign and the recurring physics — only history separates them", () => {
    const benign = scenarioById("benign_spike")!;
    const recurring = scenarioById("recurring_fault")!;

    const a = heuristicProposal(
      observationFor(benign.state(), benign.anomalyNode, [])
    );
    const b = heuristicProposal(
      observationFor(
        recurring.state(),
        recurring.anomalyNode,
        historyFor(recurring.anomalyNode, 4)
      )
    );

    expect(a.proposed_action).toBe(b.proposed_action);
  });

  it("proposes nothing on a healthy observation", () => {
    const state = SCENARIOS[0].state();
    const healthy = {
      ...state,
      nodes: state.nodes.map((node) => ({
        ...node,
        status: "healthy" as const,
        metrics: {
          ...node.metrics,
          load: 0.42,
          temp: 46,
          power: 210,
          throughput: 420,
        },
      })),
    };

    const proposal = heuristicProposal(observationFor(healthy, "node-05", []));
    expect(proposal.proposed_action).toBe("NO_OP");
    expect(proposal.target_nodes).toEqual([]);
  });
});

describe("C2.4 · the proposer's own action carries the scenario to its declared tier", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} lands on ${scenario.expect.verdict} / ${scenario.expect.tier}`, () => {
      const state = scenario.state();
      const priors =
        scenario.history === "repeat"
          ? historyFor(scenario.anomalyNode, REPEAT_OFFENDER_INCIDENTS + 1)
          : scenario.id === "ambiguous_cascade"
            ? historyFor(scenario.anomalyNode, 3)
            : [];

      const proposed = heuristicProposal(
        observationFor(state, scenario.anomalyNode, priors)
      );

      expect(proposed.proposed_action).toBe(
        scenario.proposal.proposed_action
      );

      const verdict = verifyConstraints(state, proposed);
      const operators = affectedOperators(verdict);
      const requirement = requireAuthorization(
        verdict,
        operators,
        proposed.proposed_action,
        CONFIG,
        scenario.context
      );

      expect(verdict.verdict).toBe(scenario.expect.verdict);
      expect(operators).toEqual(scenario.expect.operators);
      expect(requirement.tier).toBe(scenario.expect.tier);
      expect(requirement.quorum).toBe(scenario.expect.quorum);

      if (scenario.expect.violationNode) {
        expect(verdict.violated?.node).toBe(scenario.expect.violationNode);
      }
    });
  }

  it("never opens a gate nobody could satisfy", () => {
    for (const scenario of SCENARIOS) {
      const state = scenario.state();
      const proposed = heuristicProposal(
        observationFor(state, scenario.anomalyNode, [])
      );
      const verdict = verifyConstraints(state, proposed);
      const requirement = requireAuthorization(
        verdict,
        affectedOperators(verdict),
        proposed.proposed_action,
        CONFIG,
        scenario.context
      );

      if (requirement.tier === "T0_AUTONOMOUS") {
        expect(requirement.quorum).toBe(0);
        continue;
      }

      expect(requirement.quorum).toBeGreaterThan(0);
      expect(requirement.operatorsRequired.length).toBeGreaterThan(0);
    }
  });
});

describe("C2.4 · the committed action leaves the mesh where the verifier said it would", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} recovers ${scenario.anomalyNode} once its action is applied`, () => {
      const state = scenario.state();
      const proposed = heuristicProposal(
        observationFor(state, scenario.anomalyNode, [])
      );
      const verdict = verifyConstraints(state, proposed);
      const applied = verdict.projected[scenario.anomalyNode];

      if (proposed.proposed_action === "ISOLATE_NODE") {
        expect(verdict.dormant).toContain(scenario.anomalyNode);
        return;
      }

      const settled = equilibriumTemp(
        scenario.anomalyNode,
        applied.load,
        applied.power
      )!;
      const bounds = boundsFor(scenario.anomalyNode)!;
      expect(settled).toBeLessThan(bounds.tempWarn);
    });
  }
});

describe("C2.4 · history preconditions are checked, not assumed", () => {
  const candidates = SCENARIOS[0]
    .state()
    .nodes.filter((n) => n.id.startsWith("node-"))
    .map((n) => n.id);

  it("keeps the declared node when its history already fits", () => {
    const recurring = scenarioById("recurring_fault")!;
    const resolved = resolveScenario(recurring, candidates, {
      "node-09": REPEAT_OFFENDER_INCIDENTS + 2,
    });

    expect(resolved.scenario.anomalyNode).toBe("node-09");
    expect(resolved.relocatedFrom).toBeUndefined();
    expect(resolved.history.satisfied).toBe(true);
  });

  it("moves the control case off a node the chain has learned to distrust", () => {
    const benign = scenarioById("benign_spike")!;
    const resolved = resolveScenario(benign, candidates, {
      "node-02": REPEAT_OFFENDER_INCIDENTS + 5,
    });

    expect(resolved.relocatedFrom).toBe("node-02");
    expect(resolved.scenario.anomalyNode).not.toBe("node-02");
    expect(resolved.history.satisfied).toBe(true);
    expect(resolved.scenario.expect.operators).toEqual(["opA"]);
  });

  it("moves the repeat case onto a node the chain actually remembers", () => {
    const recurring = scenarioById("recurring_fault")!;
    const resolved = resolveScenario(recurring, candidates, {
      "node-09": 0,
      "node-01": REPEAT_OFFENDER_INCIDENTS,
    });

    expect(resolved.scenario.anomalyNode).toBe("node-01");
    expect(resolved.history.satisfied).toBe(true);
  });

  it("prefers a node belonging to the operator the scenario names", () => {
    const benign = scenarioById("benign_spike")!;
    const counts: Record<string, number> = {};
    for (const id of candidates) counts[id] = REPEAT_OFFENDER_INCIDENTS + 1;
    counts["node-04"] = 0;
    counts["node-08"] = 0;

    const resolved = resolveScenario(benign, candidates, counts);
    expect(resolved.scenario.anomalyNode).toBe("node-08");
    expect(resolved.scenario.expect.operators).toEqual(["opA"]);
  });

  it("crosses to another operator rather than give up when every opA node is a repeat offender", () => {
    const benign = scenarioById("benign_spike")!;
    const counts: Record<string, number> = {};
    for (const id of candidates) counts[id] = REPEAT_OFFENDER_INCIDENTS + 1;
    counts["node-04"] = 0;

    const resolved = resolveScenario(benign, candidates, counts);
    expect(resolved.scenario.anomalyNode).toBe("node-04");
    expect(resolved.history.satisfied).toBe(true);
    expect(resolved.scenario.expect.operators).toEqual(["opB"]);

    const state = resolved.scenario.state();
    const verdict = verifyConstraints(state, resolved.scenario.proposal);
    expect(verdict.verdict).toBe("VERIFIED");
    expect(affectedOperators(verdict)).toEqual(["opB"]);
  });

  it("never moves the cascade, whose beat depends on its exact topology", () => {
    const cascade = scenarioById("ambiguous_cascade")!;
    const counts: Record<string, number> = {};
    for (const id of candidates) counts[id] = 0;

    expect(pickHistoryNode(cascade, candidates, counts)).toBe("node-07");
    expect(relocate(cascade, "node-01").anomalyNode).toBe("node-07");
  });

  it("says so plainly when a precondition cannot be met", () => {
    const recurring = scenarioById("recurring_fault")!;
    const check = checkHistory(recurring, 0);
    expect(check.satisfied).toBe(false);
    expect(check.detail).toContain("will not escalate");

    const blind = checkHistory(recurring, null);
    expect(blind.satisfied).toBe(false);
    expect(blind.detail).toContain("no subgraph");
  });

  it("relocates a scenario without breaking anything that named the old node", () => {
    const benign = scenarioById("benign_spike")!;
    const moved: Scenario = relocate(benign, "node-03");

    expect(moved.anomalyNode).toBe("node-03");
    expect(Object.keys(moved.faults)).toEqual(["node-03"]);
    expect(moved.proposal.target_nodes).toEqual(["node-03"]);
    expect(moved.narrative).not.toContain("node-02");

    const state = moved.state();
    const detection = detectAnomaly(state);
    expect(detection.kind).toBe("anomaly");
    if (detection.kind === "anomaly") {
      expect(detection.nodeId).toBe("node-03");
    }
  });
});
