import { describe, expect, it } from "vitest";
import {
  boundsFor,
  checkState,
  requireAuthorization,
  type Proposal,
} from "@verimesh/shared";
import {
  affectedOperators,
  ambiguousCascade,
  baselineState,
  benignSpike,
  projectAction,
  recurringFault,
  verifyConstraints,
} from "../src/index";

function proposal(partial: Partial<Proposal>): Proposal {
  return {
    diagnosis: "test",
    proposed_action: "NO_OP",
    target_nodes: [],
    expected_effect: "test",
    confidence: 0.5,
    risk_flags: [],
    ...partial,
  };
}

describe("physical bounds", () => {
  it("derives every bound from the blueprint", () => {
    const bounds = boundsFor("node-07");
    expect(bounds).toBeDefined();
    expect(bounds!.tempCeiling).toBe(85);
    expect(bounds!.loadCeiling).toBe(0.92);
    expect(bounds!.powerCeiling).toBeCloseTo(945, 6);
    expect(bounds!.throughputFloorRatio).toBeCloseTo(0.55, 6);
  });

  it("holds the seeded baseline grid", () => {
    expect(checkState(baselineState())).toEqual([]);
  });
});

describe("projection", () => {
  it("is deterministic", () => {
    const state = ambiguousCascade.state();
    const a = verifyConstraints(state, ambiguousCascade.proposal);
    const b = verifyConstraints(state, ambiguousCascade.proposal);
    expect(a.projected).toEqual(b.projected);
    expect(a.verdict).toBe(b.verdict);
    expect(a.detail).toBe(b.detail);
  });

  it("does not mutate the state it is given", () => {
    const state = ambiguousCascade.state();
    const before = JSON.stringify(state);
    verifyConstraints(state, ambiguousCascade.proposal);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("sheds an isolated node's load onto its live neighbours by edge weight", () => {
    const state = ambiguousCascade.state();
    const projection = projectAction(
      state,
      proposal({ proposed_action: "ISOLATE_NODE", target_nodes: ["node-07"] }),
      0
    );
    const applied = new Map(projection.applied.nodes.map((n) => [n.id, n]));

    expect(applied.get("node-07")!.status).toBe("offline");
    expect(applied.get("node-07")!.metrics.load).toBe(0);
    expect(applied.get("node-12")!.metrics.load).toBeCloseTo(
      0.66 + (0.88 * 0.6) / 1.4,
      6
    );
    expect(applied.get("node-11")!.metrics.load).toBe(0);
  });

  it("carries per-node projected metrics for every node", () => {
    const state = benignSpike.state();
    const result = verifyConstraints(state, benignSpike.proposal);
    expect(Object.keys(result.projected).sort()).toEqual(
      state.nodes.map((n) => n.id).sort()
    );
    expect(result.projected["node-02"].temp).toBeLessThan(
      result.baseline["node-02"].temp
    );
  });
});

describe("C1.3 · the ambiguous cascade", () => {
  const state = ambiguousCascade.state();
  const result = verifyConstraints(state, ambiguousCascade.proposal);

  it("returns VIOLATION_TRIGGERED when node-07 is isolated", () => {
    expect(result.verdict).toBe("VIOLATION_TRIGGERED");
  });

  it("names node-12 as the breached node", () => {
    expect(result.violated?.node).toBe("node-12");
    expect(result.violations.every((v) => v.node === "node-12")).toBe(true);
  });

  it("breaches both the load ceiling and the thermal ceiling on node-12", () => {
    const metrics = result.violations.map((v) => v.metric).sort();
    expect(metrics).toContain("load");
    expect(metrics).toContain("temp");
    expect(result.peak["node-12"].temp).toBeGreaterThan(85);
  });

  it("does nothing of the sort under the do-nothing counterfactual", () => {
    const baseline = verifyConstraints(state, proposal({}));
    expect(baseline.verdict).toBe("VERIFIED");
    expect(baseline.peak["node-12"].temp).toBeLessThan(85);
  });

  it("puts the blast radius across two operators", () => {
    expect(result.blast.nodes).toContain("node-07");
    expect(result.blast.nodes).toContain("node-12");
    expect(affectedOperators(result)).toEqual(["opA", "opB"]);
  });

  it("drives a T2 quorum of two distinct humans", () => {
    const requirement = requireAuthorization(
      result,
      affectedOperators(result),
      ambiguousCascade.proposal.proposed_action,
      { operators: {}, budgetPerWindow: 3, windowMs: 3_600_000 },
      ambiguousCascade.context
    );
    expect(requirement.tier).toBe("T2_QUORUM");
    expect(requirement.quorum).toBe(2);
    expect(requirement.operatorsRequired).toEqual(["opA", "opB"]);
  });

  it("verifies the safe alternative the humans authorize", () => {
    const variant = ambiguousCascade.variants[0];
    const alternative = verifyConstraints(state, variant.proposal!);
    expect(alternative.verdict).toBe("VERIFIED");
    expect(affectedOperators(alternative)).toEqual(["opA"]);
  });
});

describe("C2.3 · benign spike", () => {
  it("verifies a simple THROTTLE_NODE inside one operator", () => {
    const result = verifyConstraints(benignSpike.state(), benignSpike.proposal);
    expect(result.verdict).toBe("VERIFIED");
    expect(result.violations).toEqual([]);
    expect(affectedOperators(result)).toEqual(["opA"]);
  });
});

describe("C2.2 · recurring fault", () => {
  const state = recurringFault.state();
  const result = verifyConstraints(state, recurringFault.proposal);
  const config = { operators: {}, budgetPerWindow: 3, windowMs: 3_600_000 };

  it("returns the same verdict as the first occurrence", () => {
    expect(result.verdict).toBe("VERIFIED");
  });

  it("costs a human only once history says the node is a repeat offender", () => {
    const fresh = requireAuthorization(
      result,
      affectedOperators(result),
      recurringFault.proposal.proposed_action,
      config,
      { incidentCount: 0, overrideCounts: {} }
    );
    const repeat = requireAuthorization(
      result,
      affectedOperators(result),
      recurringFault.proposal.proposed_action,
      config,
      recurringFault.context
    );

    expect(fresh.tier).toBe("T0_AUTONOMOUS");
    expect(repeat.tier).toBe("T1_SINGLE");
    expect(repeat.reason).toContain("3 prior incidents");
  });
});

describe("escalation", () => {
  it("escalates a proposal it cannot project", () => {
    const result = verifyConstraints(
      baselineState(),
      proposal({ proposed_action: "ISOLATE_NODE", target_nodes: ["node-99"] })
    );
    expect(result.verdict).toBe("ESCALATE");
    expect(result.detail).toContain("node-99");
  });

  it("escalates when the agent asks for a human directly", () => {
    const result = verifyConstraints(
      baselineState(),
      proposal({ proposed_action: "ESCALATE_TO_HUMAN" })
    );
    expect(result.verdict).toBe("ESCALATE");
  });

  it("escalates rather than verifying when a breach predates the action", () => {
    const state = baselineState();
    const hot = state.nodes.find((n) => n.id === "node-05")!;
    hot.metrics.load = 0.95;
    hot.metrics.temp = 88;
    const result = verifyConstraints(
      state,
      proposal({ proposed_action: "NO_OP" })
    );
    expect(result.verdict).toBe("ESCALATE");
    expect(result.preExisting.some((v) => v.node === "node-05")).toBe(true);
  });
});
