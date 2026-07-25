import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  blueprint,
  checkState,
  isParticipating,
  unverifiableReason,
  type Action,
  type GridNode,
  type GridState,
  type NodeStatus,
  type Proposal,
} from "@verimesh/shared";

import { baselineState, projectAction, verifyConstraints } from "../src/index";

const NODE_IDS = (blueprint as { nodes: { id: string }[] }).nodes.map(
  (n) => n.id
);

const STATUSES: NodeStatus[] = [
  "healthy",
  "warning",
  "violation",
  "awaiting_human",
  "isolated",
  "offline",
];

const metricsArb = fc.record({
  ts: fc.constant(0),
  load: fc.double({ min: 0, max: 1.2, noNaN: true }),
  temp: fc.double({ min: 18, max: 100, noNaN: true }),
  throughput: fc.double({ min: 0, max: 1200, noNaN: true }),
  power: fc.double({ min: 0, max: 1200, noNaN: true }),
  mem: fc.double({ min: 0, max: 1, noNaN: true }),
  fanRpm: fc.double({ min: 800, max: 6000, noNaN: true }),
});

const stateArb: fc.Arbitrary<GridState> = fc
  .tuple(
    fc.array(metricsArb, { minLength: NODE_IDS.length, maxLength: NODE_IDS.length }),
    fc.array(fc.constantFrom(...STATUSES), {
      minLength: NODE_IDS.length,
      maxLength: NODE_IDS.length,
    })
  )
  .map(([metrics, statuses]) => {
    const base = baselineState();
    const nodes: GridNode[] = base.nodes.map((node, i) => ({
      ...node,
      status: statuses[i],
      metrics: metrics[i],
    }));
    return { nodes, edges: base.edges };
  });

const proposalArb: fc.Arbitrary<Proposal> = fc
  .tuple(
    fc.constantFrom(...(ACTIONS as readonly Action[])),
    fc.array(fc.constantFrom(...NODE_IDS, "node-99"), {
      minLength: 0,
      maxLength: 3,
    }),
    fc.double({ min: 0, max: 1, noNaN: true })
  )
  .map(([action, targets, confidence]) => ({
    diagnosis: "property",
    proposed_action: action,
    target_nodes: targets,
    expected_effect: "property",
    confidence,
    risk_flags: [],
  }));

const HORIZON = 12;

describe("C4.1 · verifier property suite", () => {
  it("VERIFIED implies every frame of the projected trajectory is invariant-clean", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        if (result.verdict !== "VERIFIED") return true;
        const projection = projectAction(state, proposal, HORIZON);
        return projection.trajectory.every(
          (frame) => checkState(frame).length === 0
        );
      }),
      { numRuns: 400 }
    );
  });

  it("a breach anywhere in the projected trajectory is never VERIFIED", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const projection = projectAction(state, proposal, HORIZON);
        if (!projection.projectable) return true;
        const breached = projection.trajectory.some(
          (frame) => checkState(frame).length > 0
        );
        if (!breached) return true;
        return verifyConstraints(state, proposal, HORIZON).verdict !== "VERIFIED";
      }),
      { numRuns: 400 }
    );
  });

  it("a breach the action introduces always returns VIOLATION_TRIGGERED", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        if (result.violations.length === 0) return true;
        return result.verdict === "VIOLATION_TRIGGERED";
      }),
      { numRuns: 400 }
    );
  });

  it("VIOLATION_TRIGGERED always names the breach it found", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        if (result.verdict !== "VIOLATION_TRIGGERED") return true;
        return (
          result.violations.length > 0 &&
          result.violated !== undefined &&
          result.violations.some(
            (v) =>
              v.node === result.violated!.node &&
              v.metric === result.violated!.metric
          )
        );
      }),
      { numRuns: 300 }
    );
  });

  it("is deterministic and never mutates the state it is handed", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const before = JSON.stringify(state);
        const a = verifyConstraints(state, proposal, HORIZON);
        const b = verifyConstraints(state, proposal, HORIZON);
        return (
          JSON.stringify(state) === before &&
          a.verdict === b.verdict &&
          a.detail === b.detail &&
          JSON.stringify(a.projected) === JSON.stringify(b.projected)
        );
      }),
      { numRuns: 200 }
    );
  });

  it("always projects metrics for every node in the mesh", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        return state.nodes.every(
          (node) => result.projected[node.id] !== undefined
        );
      }),
      { numRuns: 200 }
    );
  });

  it("puts every node whose projection diverges from the counterfactual in the blast radius", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        if (result.verdict === "ESCALATE" && result.violations.length === 0) {
          return true;
        }
        const operators = new Set(
          result.blast.nodes.map(
            (id) => state.nodes.find((n) => n.id === id)?.operator
          )
        );
        return result.blast.operators.every((op) => operators.has(op));
      }),
      { numRuns: 200 }
    );
  });
});

const hostileMetricsArb = fc.record({
  ts: fc.constant(0),
  load: fc.oneof(fc.double({ min: 0, max: 1.2, noNaN: true }), fc.constantFrom(NaN, Infinity)),
  temp: fc.oneof(fc.double({ min: 18, max: 100, noNaN: true }), fc.constantFrom(NaN, -Infinity)),
  throughput: fc.oneof(fc.double({ min: 0, max: 1200, noNaN: true }), fc.constantFrom(NaN)),
  power: fc.oneof(fc.double({ min: 0, max: 1200, noNaN: true }), fc.constantFrom(NaN, Infinity)),
  mem: fc.double({ min: 0, max: 1, noNaN: true }),
  fanRpm: fc.double({ min: 800, max: 6000, noNaN: true }),
});

const hostileStateArb: fc.Arbitrary<GridState> = fc
  .tuple(
    fc.array(hostileMetricsArb, {
      minLength: NODE_IDS.length,
      maxLength: NODE_IDS.length,
    }),
    fc.array(fc.constantFrom(...STATUSES), {
      minLength: NODE_IDS.length,
      maxLength: NODE_IDS.length,
    }),
    fc.boolean()
  )
  .map(([metrics, statuses, withGhost]) => {
    const base = baselineState();
    const nodes: GridNode[] = base.nodes.map((node, i) => ({
      ...node,
      status: statuses[i],
      metrics: metrics[i],
    }));
    if (withGhost) {
      nodes.push({
        ...base.nodes[0],
        id: "node-ghost",
        operator: "opZ",
        status: "healthy",
      });
    }
    return { nodes, edges: base.edges };
  });

describe("C4.1 · the verifier never vouches for what it cannot check", () => {
  it("VERIFIED implies every participating node in every frame is both known and finite", () => {
    fc.assert(
      fc.property(hostileStateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        if (result.verdict !== "VERIFIED") return true;
        const projection = projectAction(state, proposal, HORIZON);
        return projection.trajectory.every((frame) =>
          frame.nodes.every(
            (node) =>
              !isParticipating(node.status) ||
              (unverifiableReason(node.id, node.metrics) === undefined &&
                checkState(frame).length === 0)
          )
        );
      }),
      { numRuns: 400 }
    );
  });

  it("never returns VERIFIED for a mesh containing a node it has no bounds for", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const withGhost = {
          edges: state.edges,
          nodes: [
            ...state.nodes,
            { ...state.nodes[0], id: "node-ghost", status: "healthy" as const },
          ],
        };
        return verifyConstraints(withGhost, proposal, HORIZON).verdict !== "VERIFIED";
      }),
      { numRuns: 200 }
    );
  });
});

describe("C4.1 · violations are attributable", () => {
  it("never blames an action for a breach the do-nothing counterfactual also has", () => {
    fc.assert(
      fc.property(stateArb, proposalArb, (state, proposal) => {
        const result = verifyConstraints(state, proposal, HORIZON);
        return result.violations.every((violation) => {
          const baseline = result.preExisting.find(
            (p) => p.node === violation.node && p.metric === violation.metric
          );
          return baseline === undefined;
        });
      }),
      { numRuns: 300 }
    );
  });
});
