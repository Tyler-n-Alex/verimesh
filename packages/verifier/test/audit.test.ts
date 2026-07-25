import { describe, expect, it } from "vitest";
import {
  isParticipating,
  isSatisfied,
  overrideCount,
  requireAuthorization,
  resolveGate,
  step,
  unverifiableReason,
  type AuthzConfig,
  type GridNode,
  type HumanApproval,
  type Proposal,
} from "@verimesh/shared";
import {
  ambiguousCascade,
  baselineState,
  quorumTruthCheck,
  verifyConstraints,
  type GraphQLFetch,
  type ResolvedGate,
} from "../src/index";

function proposal(partial: Partial<Proposal>): Proposal {
  return {
    diagnosis: "audit",
    proposed_action: "NO_OP",
    target_nodes: [],
    expected_effect: "audit",
    confidence: 0.5,
    risk_flags: [],
    ...partial,
  };
}

describe("audit · the verifier fails closed on anything it cannot check", () => {
  it("does not wave through a node that is not in the blueprint", () => {
    const state = baselineState();
    const ghost: GridNode = {
      id: "node-99",
      name: "Ghost",
      operator: "opZ",
      pos: [0, 0, 0],
      status: "healthy",
      metrics: {
        ts: 0,
        load: 5,
        temp: 999,
        throughput: 0,
        power: 99_999,
        mem: 1,
        fanRpm: 0,
      },
    };
    state.nodes.push(ghost);

    const result = verifyConstraints(state, proposal({}));
    expect(result.verdict).toBe("ESCALATE");
    expect(result.unverifiable.join(" ")).toContain("node-99");
  });

  it.each(["temp", "load", "throughput", "power"] as const)(
    "does not wave through a NaN %s",
    (metric) => {
      const state = baselineState();
      state.nodes[7].metrics[metric] = NaN;
      const result = verifyConstraints(state, proposal({}));
      expect(result.verdict).toBe("ESCALATE");
      expect(result.unverifiable.join(" ")).toContain(metric);
    }
  );

  it("does not wave through an Infinity or a missing metric", () => {
    for (const value of [Infinity, undefined as unknown as number]) {
      const state = baselineState();
      state.nodes[7].metrics.temp = value;
      expect(verifyConstraints(state, proposal({})).verdict).toBe("ESCALATE");
    }
  });

  it("flags the reason precisely enough to debug it", () => {
    expect(unverifiableReason("node-99", baselineState().nodes[0].metrics)).toContain(
      "genio_blueprint.json"
    );
    expect(
      unverifiableReason("node-07", {
        ...baselineState().nodes[0].metrics,
        load: NaN,
      })
    ).toBe("node-07 load is NaN");
  });
});

describe("audit · isolated and offline mean the same thing everywhere", () => {
  it("treats both as non-participating", () => {
    expect(isParticipating("offline")).toBe(false);
    expect(isParticipating("isolated")).toBe(false);
    expect(isParticipating("healthy")).toBe(true);
    expect(isParticipating("violation")).toBe(true);
  });

  it("does not shed load onto an isolated neighbour", () => {
    const asOffline = ambiguousCascade.state();
    const asIsolated = ambiguousCascade.state();
    asIsolated.nodes.find((n) => n.id === "node-11")!.status = "isolated";

    const a = verifyConstraints(asOffline, ambiguousCascade.proposal);
    const b = verifyConstraints(asIsolated, ambiguousCascade.proposal);

    expect(b.projected["node-12"].load).toBeCloseTo(
      a.projected["node-12"].load,
      9
    );
  });

  it("does not keep simulating an isolated node", () => {
    const state = baselineState();
    state.nodes[0].status = "isolated";
    const before = state.nodes[0].metrics.temp;
    expect(step(state).nodes[0].metrics.temp).toBe(before);
  });

  it("refuses to act on a target that is already isolated", () => {
    const state = baselineState();
    state.nodes[7].status = "isolated";
    const result = verifyConstraints(
      state,
      proposal({ proposed_action: "ISOLATE_NODE", target_nodes: ["node-07"] })
    );
    expect(result.verdict).toBe("ESCALATE");
    expect(result.detail).toContain("isolated");
  });
});

describe("audit · authorization cannot be satisfied by unvetted approvals", () => {
  const config: AuthzConfig = {
    operators: {
      opA: ["0x0000000000000000000000000000000000000000000000000000000000000a0a"],
      opB: ["0x0000000000000000000000000000000000000000000000000000000000000b0b"],
    },
    budgetPerWindow: 3,
    windowMs: 3_600_000,
  };
  const requirement = requireAuthorization(
    { verdict: "VIOLATION_TRIGGERED", detail: "audit", projected: {} },
    ["opA", "opB"],
    "ISOLATE_NODE",
    config,
    { incidentCount: 0, overrideCounts: {} }
  );

  const strangers: HumanApproval[] = [
    { nullifier: "0xdead", operator: "opA", chosenAction: "SCALE_UP", ts: 1 },
    { nullifier: "0xbeef", operator: "opB", chosenAction: "SCALE_UP", ts: 2 },
  ];

  it("is exactly the hole resolveGate closes", () => {
    expect(isSatisfied(requirement, strangers)).toBe(true);

    const resolution = resolveGate(requirement, strangers, config, {
      incidentCount: 0,
      overrideCounts: {},
    });
    expect(resolution.resolved).toBe(false);
    expect(resolution.accepted).toHaveLength(0);
    expect(resolution.rejected.map((r) => r.rejection)).toEqual([
      "NOT_ON_ALLOWLIST",
      "NOT_ON_ALLOWLIST",
    ]);
  });

  it("resolves when the humans really are enrolled and distinct", () => {
    const real: HumanApproval[] = [
      {
        nullifier: config.operators.opA[0],
        operator: "opA",
        chosenAction: "SCALE_UP",
        ts: 1,
      },
      {
        nullifier: config.operators.opB[0],
        operator: "opB",
        chosenAction: "SCALE_UP",
        ts: 2,
      },
    ];
    const resolution = resolveGate(requirement, real, config, {
      incidentCount: 0,
      overrideCounts: {},
    });
    expect(resolution.resolved).toBe(true);
    expect(resolution.accepted).toHaveLength(2);
  });

  it("takes the worst budget reading when a nullifier appears in two forms", () => {
    const context = {
      incidentCount: 0,
      overrideCounts: {
        "0x0000000000000000000000000000000000000000000000000000000000000a0a": 0,
        "0xa0a": 9,
      },
    };
    expect(overrideCount(context, "0xa0a")).toBe(9);
  });

  it("treats an unparseable nullifier as having no budget left", () => {
    expect(
      overrideCount({ incidentCount: 0, overrideCounts: {} }, "not-hex")
    ).toBe(Infinity);
  });
});

describe("audit · the harness reports red instead of crashing", () => {
  it("survives a malformed nullifier coming back from the subgraph", async () => {
    const config: AuthzConfig = {
      operators: { opA: ["0x0a0a"], opB: ["0x0b0b"] },
      budgetPerWindow: 3,
      windowMs: 3_600_000,
    };
    const gate: ResolvedGate = {
      decisionId: "0xabc",
      chosenAction: "SCALE_UP",
      requirement: requireAuthorization(
        { verdict: "VIOLATION_TRIGGERED", detail: "audit", projected: {} },
        ["opA", "opB"],
        "ISOLATE_NODE",
        config,
        { incidentCount: 0, overrideCounts: {} }
      ),
      approvals: [
        { nullifier: "0x0a0a", operator: "opA", chosenAction: "SCALE_UP", ts: 1 },
      ],
    };

    const badFetch: GraphQLFetch = async () => ({
      approvals: [
        {
          id: "1",
          worldIdNullifier: "not-a-hex-value",
          operator: "opA",
          approvalIndex: 0,
          ts: "1",
          txHash: "0x1",
        },
      ],
      overrides: [
        {
          id: "1",
          chosenAction: "SCALE_UP",
          approvalsCollected: 1,
          ts: "1",
          txHash: "0x1",
        },
      ],
    });

    const [result] = await quorumTruthCheck([gate], badFetch);
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("unparseable");
  });
});
