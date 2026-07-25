import { describe, expect, it } from "vitest";
import {
  normalizeNullifier,
  requireAuthorization,
  type AuthorizationRequirement,
  type DecisionRecord,
  type HumanApproval,
} from "@verimesh/shared";
import {
  authorizationTraceCheck,
  quorumTruthCheck,
  runAcceptance,
  subgraphTruthCheck,
  type GraphQLFetch,
  type ResolvedGate,
} from "../src/index";

const NULLIFIER_A = normalizeNullifier(
  "0x00000000000000000000000000000000000000000000000000000000000a11ce"
);
const NULLIFIER_B = normalizeNullifier(
  "0x0000000000000000000000000000000000000000000000000000000000000b0b"
);

const DECISION_ID = "0xabc0000000000000000000000000000000000000000000000000000000000001";
const TX_HASH = "0xfeed000000000000000000000000000000000000000000000000000000000001";
const ZEROG_ROOT = "0x0611000000000000000000000000000000000000000000000000000000000001";

const committed: DecisionRecord = {
  id: DECISION_ID,
  nodeId: "node-07",
  operator: "opA",
  action: "SCALE_UP",
  verdict: "VIOLATION_TRIGGERED",
  humanAuthorized: true,
  authTier: "T2_QUORUM",
  approvals: [],
  zerogRoot: ZEROG_ROOT,
  chainTxHash: TX_HASH,
  ts: 1_784_900_000_000,
};

const requirement: AuthorizationRequirement = requireAuthorization(
  {
    verdict: "VIOLATION_TRIGGERED",
    detail: "isolating node-07 breaches node-12",
    projected: {},
  },
  ["opA", "opB"],
  "ISOLATE_NODE",
  { operators: { opA: [NULLIFIER_A], opB: [NULLIFIER_B] }, budgetPerWindow: 3, windowMs: 3_600_000 },
  { incidentCount: 0, overrideCounts: {} }
);

const approvals: HumanApproval[] = [
  { nullifier: NULLIFIER_A, operator: "opA", chosenAction: "SCALE_UP", ts: 1 },
  { nullifier: NULLIFIER_B, operator: "opB", chosenAction: "SCALE_UP", ts: 2 },
];

const gate: ResolvedGate = {
  decisionId: DECISION_ID,
  chosenAction: "SCALE_UP",
  requirement,
  approvals,
  requirementSource: "gate-record",
};

interface StubRows {
  decisions?: unknown[];
  approvals?: unknown[];
  overrides?: unknown[];
}

function stub(rows: StubRows): GraphQLFetch {
  return async (query) => {
    if (query.includes("DecisionTruth")) {
      return { decisions: rows.decisions ?? [] };
    }
    if (query.includes("AuthorizedDecisions")) {
      return {
        decisions: (rows.decisions ?? []).filter(
          (d) => (d as { humanAuthorized?: boolean }).humanAuthorized
        ),
        approvals: (rows.approvals ?? []).map((a) => ({
          ...(a as object),
          decisionId: DECISION_ID,
        })),
      };
    }
    return {
      approvals: rows.approvals ?? [],
      overrides: rows.overrides ?? [],
    };
  };
}

const indexedDecision = {
  id: DECISION_ID.toLowerCase(),
  nodeId: "node-07",
  operator: "opA",
  action: "SCALE_UP",
  verdict: "VIOLATION_TRIGGERED",
  authTier: 2,
  humanAuthorized: true,
  zerogRoot: ZEROG_ROOT,
  ts: "1784900000000",
  txHash: TX_HASH,
};

const indexedApprovals = [
  {
    id: `${DECISION_ID}-0`,
    worldIdNullifier: NULLIFIER_A,
    operator: "opA",
    approvalIndex: 0,
    ts: "1784900000001",
    txHash: TX_HASH,
  },
  {
    id: `${DECISION_ID}-1`,
    worldIdNullifier: NULLIFIER_B,
    operator: "opB",
    approvalIndex: 1,
    ts: "1784900000002",
    txHash: TX_HASH,
  },
];

const indexedOverride = {
  id: `${DECISION_ID}-override`,
  chosenAction: "SCALE_UP",
  approvalsCollected: 2,
  ts: "1784900000003",
  txHash: TX_HASH,
};

describe("C5.1 · subgraph-truth check", () => {
  it("passes when the indexed row matches the committed decision", async () => {
    const [result] = await subgraphTruthCheck(
      [committed],
      stub({ decisions: [indexedDecision] })
    );
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it("fails when a committed decision was never indexed", async () => {
    const [result] = await subgraphTruthCheck([committed], stub({}));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("absent from the subgraph");
  });

  it("catches a field the agent would misremember", async () => {
    const [result] = await subgraphTruthCheck(
      [committed],
      stub({ decisions: [{ ...indexedDecision, action: "ISOLATE_NODE" }] })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("action");
  });

  it("catches a tier the chain disagrees with", async () => {
    const [result] = await subgraphTruthCheck(
      [committed],
      stub({ decisions: [{ ...indexedDecision, authTier: 1 }] })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("authTier");
  });

  it("catches an indexed row whose 0G root does not resolve to the committed blob", async () => {
    const [result] = await subgraphTruthCheck(
      [committed],
      stub({ decisions: [{ ...indexedDecision, zerogRoot: null }] })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("zerogRoot");
  });
});

describe("C5.2 · quorum-truth check", () => {
  it("passes when the chain records exactly the humans the policy demanded", async () => {
    const [result] = await quorumTruthCheck(
      [gate],
      stub({ approvals: indexedApprovals, overrides: [indexedOverride] })
    );
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it("fails when the chain is one human short of the quorum", async () => {
    const [result] = await quorumTruthCheck(
      [gate],
      stub({
        approvals: [indexedApprovals[0]],
        overrides: [{ ...indexedOverride, approvalsCollected: 1 }],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("quorum");
  });

  it("fails when the chain authorized a human the policy never accepted", async () => {
    const intruder = {
      ...indexedApprovals[1],
      worldIdNullifier: normalizeNullifier("0x00000000000000000000000000000000000000000000000000000000000c4801"),
      operator: "opB",
    };
    const [result] = await quorumTruthCheck(
      [gate],
      stub({
        approvals: [indexedApprovals[0], intruder],
        overrides: [indexedOverride],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("never accepted");
  });

  it("fails when the same human was recorded twice on-chain", async () => {
    const [result] = await quorumTruthCheck(
      [gate],
      stub({
        approvals: [indexedApprovals[0], { ...indexedApprovals[1], worldIdNullifier: NULLIFIER_A }],
        overrides: [indexedOverride],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("distinct humans");
  });

  it("fails when the resolved action on-chain is not the one the humans chose", async () => {
    const [result] = await quorumTruthCheck(
      [gate],
      stub({
        approvals: indexedApprovals,
        overrides: [{ ...indexedOverride, chosenAction: "ISOLATE_NODE" }],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("chosenAction");
  });

  it("fails when the override was never resolved on-chain", async () => {
    const [result] = await quorumTruthCheck(
      [gate],
      stub({ approvals: indexedApprovals })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("OverrideResolved");
  });
});

describe("C5.3 · the harness verdict", () => {
  it("is green only when both checks are green", async () => {
    const green = await runAcceptance(
      { decisions: [committed], gates: [gate] },
      stub({
        decisions: [indexedDecision],
        approvals: indexedApprovals,
        overrides: [indexedOverride],
      })
    );
    expect(green.ok).toBe(true);
    expect(green.results).toHaveLength(3);

    const red = await runAcceptance(
      { decisions: [committed], gates: [gate] },
      stub({ decisions: [indexedDecision], approvals: indexedApprovals })
    );
    expect(red.ok).toBe(false);
    expect(red.red).toHaveLength(1);
  });

  it("reports a dead endpoint as red rather than as a pass", async () => {
    const failing: GraphQLFetch = async () => {
      throw new Error("subgraph HTTP 502");
    };
    const report = await runAcceptance(
      { decisions: [committed], gates: [gate] },
      failing
    );
    expect(report.ok).toBe(false);
    expect(report.red).toHaveLength(3);
  });
});

describe("C5.2 · the requirement's provenance is part of the result", () => {
  it("says so when operatorsRequired was reconstructed rather than read from the gate record", async () => {
    const [result] = await quorumTruthCheck(
      [{ ...gate, requirementSource: "chain-derived" }],
      stub({ approvals: indexedApprovals, overrides: [indexedOverride] })
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("not independently checked");
  });
});

describe("C5.2 · authorization-trace check", () => {
  it("catches a decision that claims a human authorized it with no approvals on-chain", async () => {
    const orphanFetch: GraphQLFetch = async (query) => {
      if (query.includes("AuthorizedDecisions")) {
        return {
          decisions: [
            { id: DECISION_ID, nodeId: "node-07", authTier: 2 },
          ],
          approvals: [],
        };
      }
      return {};
    };
    const [result] = await authorizationTraceCheck(orphanFetch);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("resolveOverride was never called");
    expect(result.mismatches[0]).toContain("node-07");
  });

  it("passes when every human-authorized decision has its approvals indexed", async () => {
    const goodFetch: GraphQLFetch = async (query) => {
      if (query.includes("AuthorizedDecisions")) {
        return {
          decisions: [{ id: DECISION_ID, nodeId: "node-07", authTier: 2 }],
          approvals: [{ decisionId: DECISION_ID.toUpperCase() }],
        };
      }
      return {};
    };
    const [result] = await authorizationTraceCheck(goodFetch);
    expect(result.ok).toBe(true);
  });
});
