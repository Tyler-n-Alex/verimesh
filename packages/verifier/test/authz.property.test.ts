import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkApproval,
  distinctNullifiers,
  isSatisfied,
  normalizeNullifier,
  requireAuthorization,
  type AuthorizationRequirement,
  type AuthzConfig,
  type AuthzContext,
  type HumanApproval,
  type Verdict,
  type VerdictResult,
} from "@verimesh/shared";

const NULLIFIERS = [
  "0x00000000000000000000000000000000000000000000000000000000000a11ce",
  "0x0000000000000000000000000000000000000000000000000000000000000b0b",
  "0x00000000000000000000000000000000000000000000000000000000000c4801",
  "0x00000000000000000000000000000000000000000000000000000000000d1e60",
];

const OPERATORS = ["opA", "opB", "opC"];

const VERDICTS: Verdict[] = ["VERIFIED", "VIOLATION_TRIGGERED", "ESCALATE"];

const ACTIONS = [
  "REBALANCE_LOAD",
  "THROTTLE_NODE",
  "ISOLATE_NODE",
  "SCALE_UP",
  "NO_OP",
];

function verdictResult(verdict: Verdict): VerdictResult {
  return { verdict, detail: "property", projected: {} };
}

const configArb: fc.Arbitrary<AuthzConfig> = fc
  .tuple(
    fc.array(fc.constantFrom(...NULLIFIERS), { maxLength: 4 }),
    fc.array(fc.constantFrom(...NULLIFIERS), { maxLength: 4 }),
    fc.array(fc.constantFrom(...NULLIFIERS), { maxLength: 4 }),
    fc.integer({ min: 1, max: 3 })
  )
  .map(([a, b, c, budget]) => ({
    operators: { opA: a, opB: b, opC: c },
    budgetPerWindow: budget,
    windowMs: 3_600_000,
  }));

const contextArb: fc.Arbitrary<AuthzContext> = fc
  .tuple(
    fc.integer({ min: 0, max: 6 }),
    fc.array(fc.integer({ min: 0, max: 4 }), {
      minLength: NULLIFIERS.length,
      maxLength: NULLIFIERS.length,
    })
  )
  .map(([incidentCount, counts]) => {
    const overrideCounts: Record<string, number> = {};
    NULLIFIERS.forEach((nullifier, i) => {
      overrideCounts[nullifier] = counts[i];
    });
    return { incidentCount, overrideCounts };
  });

const approvalsArb: fc.Arbitrary<HumanApproval[]> = fc.array(
  fc
    .tuple(fc.constantFrom(...NULLIFIERS), fc.constantFrom(...OPERATORS))
    .map(([nullifier, operator]) => ({
      nullifier,
      operator,
      chosenAction: "SCALE_UP",
      ts: 0,
    })),
  { maxLength: 6 }
);

const operatorsArb = fc.array(fc.constantFrom(...OPERATORS), { maxLength: 4 });

function collect(
  requirement: AuthorizationRequirement,
  candidates: HumanApproval[],
  config: AuthzConfig,
  context: AuthzContext
): HumanApproval[] {
  const accepted: HumanApproval[] = [];
  for (const candidate of candidates) {
    const check = checkApproval(
      requirement,
      accepted,
      candidate,
      config,
      context
    );
    if (check.accepted) accepted.push(candidate);
  }
  return accepted;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

function hasInjectiveCover(
  operatorsRequired: string[],
  accepted: HumanApproval[]
): boolean {
  if (operatorsRequired.length === 0) return true;
  const humans = Array.from(
    new Map(
      accepted.map((a) => [normalizeNullifier(a.nullifier), a] as const)
    ).values()
  );
  for (const order of permutations(humans)) {
    const used = new Set<number>();
    let ok = true;
    for (const operator of operatorsRequired) {
      const index = order.findIndex(
        (human, i) => !used.has(i) && human.operator === operator
      );
      if (index === -1) {
        ok = false;
        break;
      }
      used.add(index);
    }
    if (ok) return true;
  }
  return false;
}

describe("C4.2 · authorization policy property suite", () => {
  it("a cross-operator action never resolves on fewer than 2 distinct nullifiers", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        approvalsArb,
        (verdict, operators, action, config, context, candidates) => {
          const requirement = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          const crossOperator = new Set(operators).size > 1;
          if (!crossOperator) return true;
          if (requirement.tier !== "T2_QUORUM") return false;
          if (requirement.quorum < 2) return false;

          const accepted = collect(requirement, candidates, config, context);
          if (!isSatisfied(requirement, accepted)) return true;
          return (
            distinctNullifiers(accepted.map((a) => a.nullifier)).length >= 2
          );
        }
      ),
      { numRuns: 500 }
    );
  });

  it("a T1 or T2 action never resolves on a nullifier off the affected operator's allowlist", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        approvalsArb,
        (verdict, operators, action, config, context, candidates) => {
          const requirement = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          if (requirement.tier === "T0_AUTONOMOUS") return true;

          const accepted = collect(requirement, candidates, config, context);
          if (!isSatisfied(requirement, accepted)) return true;

          return accepted.every((approval) => {
            const allowlist = (config.operators[approval.operator] ?? []).map(
              normalizeNullifier
            );
            return (
              requirement.operatorsRequired.includes(approval.operator) &&
              allowlist.includes(normalizeNullifier(approval.nullifier))
            );
          });
        }
      ),
      { numRuns: 500 }
    );
  });

  it("the per-human override budget is never exceeded", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        approvalsArb,
        (verdict, operators, action, config, context, candidates) => {
          const requirement = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          const accepted = collect(requirement, candidates, config, context);
          return accepted.every(
            (approval) =>
              (context.overrideCounts[normalizeNullifier(approval.nullifier)] ??
                0) < config.budgetPerWindow
          );
        }
      ),
      { numRuns: 500 }
    );
  });

  it("the same human is never counted twice", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        approvalsArb,
        (verdict, operators, action, config, context, candidates) => {
          const requirement = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          const accepted = collect(requirement, candidates, config, context);
          return (
            distinctNullifiers(accepted.map((a) => a.nullifier)).length ===
            accepted.length
          );
        }
      ),
      { numRuns: 500 }
    );
  });

  it("resolution requires one distinct human per required operator", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        approvalsArb,
        (verdict, operators, action, config, context, candidates) => {
          const requirement = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          const accepted = collect(requirement, candidates, config, context);
          if (!isSatisfied(requirement, accepted)) return true;
          return hasInjectiveCover(requirement.operatorsRequired, accepted);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("a T0 requirement accepts no human and is satisfied by none", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        approvalsArb,
        (verdict, operators, action, config, context, candidates) => {
          const requirement = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          if (requirement.tier !== "T0_AUTONOMOUS") return true;
          const accepted = collect(requirement, candidates, config, context);
          return (
            requirement.quorum === 0 &&
            requirement.operatorsRequired.length === 0 &&
            accepted.length === 0 &&
            isSatisfied(requirement, [])
          );
        }
      ),
      { numRuns: 300 }
    );
  });

  it("is a pure function of its inputs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        operatorsArb,
        fc.constantFrom(...ACTIONS),
        configArb,
        contextArb,
        (verdict, operators, action, config, context) => {
          const a = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          const b = requireAuthorization(
            verdictResult(verdict),
            operators,
            action,
            config,
            context
          );
          return JSON.stringify(a) === JSON.stringify(b);
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe("C3 · authorization policy units", () => {
  const config: AuthzConfig = {
    operators: {
      opA: [NULLIFIERS[0]],
      opB: [NULLIFIERS[1]],
      opC: [],
    },
    budgetPerWindow: 3,
    windowMs: 3_600_000,
  };
  const fresh: AuthzContext = { incidentCount: 0, overrideCounts: {} };

  it("acts alone on a verified single-operator action", () => {
    const requirement = requireAuthorization(
      verdictResult("VERIFIED"),
      ["opA"],
      "THROTTLE_NODE",
      config,
      fresh
    );
    expect(requirement.tier).toBe("T0_AUTONOMOUS");
    expect(requirement.quorum).toBe(0);
  });

  it("requires one human for a high-privilege action inside one operator", () => {
    const requirement = requireAuthorization(
      verdictResult("VERIFIED"),
      ["opA"],
      "ISOLATE_NODE",
      config,
      fresh
    );
    expect(requirement.tier).toBe("T1_SINGLE");
    expect(requirement.operatorsRequired).toEqual(["opA"]);
  });

  it("requires two distinct humans the moment the effect crosses operators", () => {
    const requirement = requireAuthorization(
      verdictResult("VIOLATION_TRIGGERED"),
      ["opB", "opA"],
      "ISOLATE_NODE",
      config,
      fresh
    );
    expect(requirement.tier).toBe("T2_QUORUM");
    expect(requirement.quorum).toBe(2);
    expect(requirement.operatorsRequired).toEqual(["opA", "opB"]);
  });

  it("rejects the same human scanning twice, in any representation", () => {
    const requirement = requireAuthorization(
      verdictResult("VIOLATION_TRIGGERED"),
      ["opA", "opB"],
      "ISOLATE_NODE",
      config,
      fresh
    );
    const first: HumanApproval = {
      nullifier: NULLIFIERS[0],
      operator: "opA",
      chosenAction: "SCALE_UP",
      ts: 1,
    };
    const decimalForm = BigInt(NULLIFIERS[0]).toString(10);
    const again: HumanApproval = {
      nullifier: decimalForm,
      operator: "opA",
      chosenAction: "SCALE_UP",
      ts: 2,
    };

    expect(checkApproval(requirement, [], first, config, fresh)).toEqual({
      accepted: true,
    });
    expect(
      checkApproval(requirement, [first], again, config, fresh).rejection
    ).toBe("DUPLICATE_HUMAN");
    expect(isSatisfied(requirement, [first])).toBe(false);
  });

  it("rejects a real human who is not on the affected operator's allowlist", () => {
    const requirement = requireAuthorization(
      verdictResult("VIOLATION_TRIGGERED"),
      ["opA"],
      "ISOLATE_NODE",
      config,
      fresh
    );
    const stranger: HumanApproval = {
      nullifier: NULLIFIERS[2],
      operator: "opA",
      chosenAction: "SCALE_UP",
      ts: 1,
    };
    expect(
      checkApproval(requirement, [], stranger, config, fresh).rejection
    ).toBe("NOT_ON_ALLOWLIST");
  });

  it("rejects a human who has spent their override budget", () => {
    const spent: AuthzContext = {
      incidentCount: 0,
      overrideCounts: { [normalizeNullifier(NULLIFIERS[0])]: 3 },
    };
    const requirement = requireAuthorization(
      verdictResult("VIOLATION_TRIGGERED"),
      ["opA"],
      "ISOLATE_NODE",
      config,
      spent
    );
    const approval: HumanApproval = {
      nullifier: NULLIFIERS[0],
      operator: "opA",
      chosenAction: "SCALE_UP",
      ts: 1,
    };
    expect(
      checkApproval(requirement, [], approval, config, spent).rejection
    ).toBe("BUDGET_EXCEEDED");
  });

  it("resolves a T2 gate only on two distinct enrolled humans", () => {
    const requirement = requireAuthorization(
      verdictResult("VIOLATION_TRIGGERED"),
      ["opA", "opB"],
      "ISOLATE_NODE",
      config,
      fresh
    );
    const opAHuman: HumanApproval = {
      nullifier: NULLIFIERS[0],
      operator: "opA",
      chosenAction: "SCALE_UP",
      ts: 1,
    };
    const opBHuman: HumanApproval = {
      nullifier: NULLIFIERS[1],
      operator: "opB",
      chosenAction: "SCALE_UP",
      ts: 2,
    };

    expect(isSatisfied(requirement, [opAHuman])).toBe(false);
    expect(isSatisfied(requirement, [opAHuman, opBHuman])).toBe(true);
  });

  it("does not let one human cover both operators", () => {
    const twoHats: AuthzConfig = {
      ...config,
      operators: {
        opA: [NULLIFIERS[0]],
        opB: [NULLIFIERS[0]],
        opC: [],
      },
    };
    const requirement = requireAuthorization(
      verdictResult("VIOLATION_TRIGGERED"),
      ["opA", "opB"],
      "ISOLATE_NODE",
      twoHats,
      fresh
    );
    const asOpA: HumanApproval = {
      nullifier: NULLIFIERS[0],
      operator: "opA",
      chosenAction: "SCALE_UP",
      ts: 1,
    };
    const asOpB: HumanApproval = {
      nullifier: NULLIFIERS[0],
      operator: "opB",
      chosenAction: "SCALE_UP",
      ts: 2,
    };

    const accepted = collect(requirement, [asOpA, asOpB], twoHats, fresh);
    expect(accepted).toHaveLength(1);
    expect(isSatisfied(requirement, accepted)).toBe(false);
  });
});
