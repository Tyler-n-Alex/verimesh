import {
  authzConfig,
  requireAuthorization,
  type AuthzConfig,
  type AuthzContext,
  type Proposal,
} from "@verimesh/shared";
import type { CheckResult } from "./acceptance";
import { SCENARIOS, type Scenario, type ScenarioExpectation } from "./scenarios";
import { affectedOperators, verifyConstraints } from "./verify";

export interface ScenarioRun {
  scenario: string;
  variant?: string;
  verdict: string;
  violationNode?: string;
  operators: string[];
  tier: string;
  quorum: number;
  reason: string;
  detail: string;
  results: CheckResult[];
}

function expectations(
  label: string,
  expected: ScenarioExpectation,
  actual: {
    verdict: string;
    violationNode?: string;
    operators: string[];
    tier: string;
    quorum: number;
  }
): CheckResult[] {
  const mismatches: string[] = [];

  if (actual.verdict !== expected.verdict) {
    mismatches.push(
      `verdict: expected ${expected.verdict}, got ${actual.verdict}`
    );
  }
  if (expected.violationNode && actual.violationNode !== expected.violationNode) {
    mismatches.push(
      `violating node: expected ${expected.violationNode}, got ${actual.violationNode ?? "none"}`
    );
  }
  if (actual.operators.join(",") !== expected.operators.join(",")) {
    mismatches.push(
      `blast radius: expected ${expected.operators.join(", ")}, got ${actual.operators.join(", ") || "none"}`
    );
  }
  if (actual.tier !== expected.tier) {
    mismatches.push(`tier: expected ${expected.tier}, got ${actual.tier}`);
  }
  if (actual.quorum !== expected.quorum) {
    mismatches.push(`quorum: expected ${expected.quorum}, got ${actual.quorum}`);
  }

  return [
    {
      check: "C5.3 scenario",
      subject: label,
      ok: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? `${actual.verdict} · ${actual.tier} · quorum ${actual.quorum}`
          : `${mismatches.length} expectation(s) missed`,
      mismatches,
    },
  ];
}

function evaluate(
  label: string,
  scenario: Scenario,
  proposal: Proposal,
  context: AuthzContext,
  expected: ScenarioExpectation,
  config: AuthzConfig,
  variant?: string
): ScenarioRun {
  const verdict = verifyConstraints(scenario.state(), proposal);
  const operators = affectedOperators(verdict);
  const requirement = requireAuthorization(
    verdict,
    operators,
    proposal.proposed_action,
    config,
    context
  );

  const actual = {
    verdict: verdict.verdict,
    violationNode: verdict.violated?.node,
    operators,
    tier: requirement.tier,
    quorum: requirement.quorum,
  };

  return {
    scenario: scenario.id,
    variant,
    ...actual,
    reason: requirement.reason,
    detail: verdict.detail,
    results: expectations(label, expected, actual),
  };
}

export function runScenario(
  scenario: Scenario,
  config: AuthzConfig = authzConfig as AuthzConfig
): ScenarioRun[] {
  const runs: ScenarioRun[] = [
    evaluate(
      scenario.id,
      scenario,
      scenario.proposal,
      scenario.context,
      scenario.expect,
      config
    ),
  ];

  for (const variant of scenario.variants) {
    runs.push(
      evaluate(
        `${scenario.id}/${variant.id}`,
        scenario,
        variant.proposal ?? scenario.proposal,
        variant.context ?? scenario.context,
        variant.expect,
        config,
        variant.id
      )
    );
  }

  return runs;
}

export function runAllScenarios(
  config: AuthzConfig = authzConfig as AuthzConfig
): ScenarioRun[] {
  return SCENARIOS.flatMap((scenario) => runScenario(scenario, config));
}
