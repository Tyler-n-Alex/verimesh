import { distinctNullifiers, normalizeNullifier } from "./nullifier";
import { describeViolation } from "./invariants";
import type {
  AuthTier,
  AuthorizationRequirement,
  AuthzConfig,
  AuthzContext,
  HumanApproval,
  VerdictResult,
} from "./types";

export const HIGH_PRIVILEGE_ACTIONS = ["ISOLATE_NODE"];

export const REPEAT_OFFENDER_INCIDENTS = 2;

export const HISTORY_ESCALATION_CEILING: AuthTier = "T1_SINGLE";

export const TIER_ORDER: AuthTier[] = [
  "T0_AUTONOMOUS",
  "T1_SINGLE",
  "T2_QUORUM",
];

export type RequireAuthorization = (
  verdict: VerdictResult,
  affectedOperators: string[],
  proposedAction: string,
  config: AuthzConfig,
  context: AuthzContext
) => AuthorizationRequirement;

export type ApprovalRejection =
  | "DUPLICATE_HUMAN"
  | "NOT_ON_ALLOWLIST"
  | "BUDGET_EXCEEDED"
  | "OPERATOR_NOT_REQUIRED";

export interface ApprovalCheck {
  accepted: boolean;
  rejection?: ApprovalRejection;
}

export type CheckApproval = (
  requirement: AuthorizationRequirement,
  collected: HumanApproval[],
  candidate: HumanApproval,
  config: AuthzConfig,
  context: AuthzContext
) => ApprovalCheck;

export type IsSatisfied = (
  requirement: AuthorizationRequirement,
  collected: HumanApproval[]
) => boolean;

export function tierRank(tier: AuthTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function maxTier(a: AuthTier, b: AuthTier): AuthTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

export function nextTier(tier: AuthTier): AuthTier {
  const rank = tierRank(tier);
  return TIER_ORDER[Math.min(rank + 1, TIER_ORDER.length - 1)];
}

function uniqueOperators(operators: string[]): string[] {
  return Array.from(new Set(operators.filter((o) => o.length > 0))).sort();
}

function allowlistFor(config: AuthzConfig, operator: string): string[] {
  const raw = config.operators[operator] ?? [];
  const out: string[] = [];
  for (const entry of raw) {
    try {
      out.push(normalizeNullifier(entry));
    } catch {
      continue;
    }
  }
  return out;
}

export function isEnrolled(
  config: AuthzConfig,
  operator: string,
  nullifier: string
): boolean {
  let normalized: string;
  try {
    normalized = normalizeNullifier(nullifier);
  } catch {
    return false;
  }
  return allowlistFor(config, operator).includes(normalized);
}

export function operatorsFor(config: AuthzConfig, nullifier: string): string[] {
  let normalized: string;
  try {
    normalized = normalizeNullifier(nullifier);
  } catch {
    return [];
  }
  return Object.keys(config.operators)
    .filter((operator) => allowlistFor(config, operator).includes(normalized))
    .sort();
}

export function overrideCount(
  context: AuthzContext,
  nullifier: string
): number {
  let normalized: string;
  try {
    normalized = normalizeNullifier(nullifier);
  } catch {
    return Infinity;
  }
  let highest = 0;
  for (const [key, value] of Object.entries(context.overrideCounts)) {
    try {
      if (normalizeNullifier(key) === normalized) {
        highest = Math.max(highest, value);
      }
    } catch {
      continue;
    }
  }
  return highest;
}

export function hasBudget(
  config: AuthzConfig,
  context: AuthzContext,
  nullifier: string
): boolean {
  return overrideCount(context, nullifier) < config.budgetPerWindow;
}

function baseTier(
  verdict: VerdictResult,
  operators: string[],
  proposedAction: string
): AuthTier {
  if (operators.length > 1) return "T2_QUORUM";

  const unsafeVerdict =
    verdict.verdict === "VIOLATION_TRIGGERED" || verdict.verdict === "ESCALATE";

  if (unsafeVerdict) return "T1_SINGLE";
  if (HIGH_PRIVILEGE_ACTIONS.includes(proposedAction)) return "T1_SINGLE";

  return "T0_AUTONOMOUS";
}

function quorumFor(tier: AuthTier, operators: string[]): number {
  if (tier === "T0_AUTONOMOUS") return 0;
  if (tier === "T1_SINGLE") return 1;
  return Math.max(2, operators.length);
}

function reasonFor(
  tier: AuthTier,
  verdict: VerdictResult,
  operators: string[],
  proposedAction: string,
  escalated: boolean,
  context: AuthzContext
): string {
  const parts: string[] = [];

  if (tier === "T2_QUORUM") {
    const breach = verdict.violated
      ? ` — ${describeViolation(verdict.violated)}`
      : "";
    parts.push(
      `${proposedAction} projects across ${operators.length} operators (${operators.join(", ")})${breach}`
    );
  } else if (tier === "T1_SINGLE") {
    if (verdict.verdict === "VIOLATION_TRIGGERED" && verdict.violated) {
      parts.push(
        `${proposedAction} breaches ${describeViolation(verdict.violated)}`
      );
    } else if (verdict.verdict === "ESCALATE") {
      parts.push(`${proposedAction} could not be verified: ${verdict.detail}`);
    } else if (HIGH_PRIVILEGE_ACTIONS.includes(proposedAction)) {
      parts.push(`${proposedAction} is a high-privilege action`);
    } else {
      parts.push(`${proposedAction} requires an accountable human`);
    }
  } else {
    parts.push(
      `${proposedAction} is in-envelope and confined to ${operators[0] ?? "no operator"}`
    );
  }

  if (escalated) {
    parts.push(
      `escalated: ${context.incidentCount} prior incidents on this node`
    );
  }

  return parts.join(" · ");
}

export const requireAuthorization: RequireAuthorization = (
  verdict,
  affectedOperators,
  proposedAction,
  config,
  context
) => {
  const operators = uniqueOperators(affectedOperators);
  const base = baseTier(verdict, operators, proposedAction);

  const repeatOffender = context.incidentCount >= REPEAT_OFFENDER_INCIDENTS;
  const escalated =
    repeatOffender && tierRank(base) < tierRank(HISTORY_ESCALATION_CEILING);

  const tier = escalated ? nextTier(base) : base;

  const operatorsRequired =
    tier === "T0_AUTONOMOUS" ? [] : operators.slice();

  return {
    tier,
    quorum: quorumFor(tier, operatorsRequired),
    operatorsRequired,
    reason: reasonFor(
      tier,
      verdict,
      operators,
      proposedAction,
      escalated,
      context
    ),
  };
};

export const checkApproval: CheckApproval = (
  requirement,
  collected,
  candidate,
  config,
  context
) => {
  let normalized: string;
  try {
    normalized = normalizeNullifier(candidate.nullifier);
  } catch {
    return { accepted: false, rejection: "NOT_ON_ALLOWLIST" };
  }

  for (const existing of collected) {
    let existingNullifier: string;
    try {
      existingNullifier = normalizeNullifier(existing.nullifier);
    } catch {
      continue;
    }
    if (existingNullifier === normalized) {
      return { accepted: false, rejection: "DUPLICATE_HUMAN" };
    }
  }

  if (!requirement.operatorsRequired.includes(candidate.operator)) {
    return { accepted: false, rejection: "OPERATOR_NOT_REQUIRED" };
  }

  if (!isEnrolled(config, candidate.operator, normalized)) {
    return { accepted: false, rejection: "NOT_ON_ALLOWLIST" };
  }

  if (!hasBudget(config, context, normalized)) {
    return { accepted: false, rejection: "BUDGET_EXCEEDED" };
  }

  return { accepted: true };
};

function coversRequiredOperators(
  operatorsRequired: string[],
  collected: HumanApproval[]
): boolean {
  if (operatorsRequired.length === 0) return true;

  const seen = new Set<string>();
  const humans: { nullifier: string; operator: string }[] = [];
  for (const approval of collected) {
    let normalized: string;
    try {
      normalized = normalizeNullifier(approval.nullifier);
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    humans.push({ nullifier: normalized, operator: approval.operator });
  }

  const assigned = new Map<number, string>();

  function assign(operator: string, blocked: Set<string>): boolean {
    for (let i = 0; i < humans.length; i++) {
      const human = humans[i];
      if (human.operator !== operator) continue;
      if (blocked.has(human.nullifier)) continue;
      blocked.add(human.nullifier);
      const current = assigned.get(i);
      if (current === undefined || assign(current, blocked)) {
        assigned.set(i, operator);
        return true;
      }
    }
    return false;
  }

  for (const operator of operatorsRequired) {
    if (!assign(operator, new Set<string>())) return false;
  }

  return true;
}

export const isSatisfied: IsSatisfied = (requirement, collected) => {
  const distinct = distinctNullifiers(
    collected
      .map((approval) => {
        try {
          return normalizeNullifier(approval.nullifier);
        } catch {
          return "";
        }
      })
      .filter((value) => value.length > 0)
  );

  if (distinct.length < requirement.quorum) return false;

  return coversRequiredOperators(requirement.operatorsRequired, collected);
};

export interface GateResolution {
  resolved: boolean;
  accepted: HumanApproval[];
  rejected: { approval: HumanApproval; rejection: ApprovalRejection }[];
}

export function resolveGate(
  requirement: AuthorizationRequirement,
  collected: HumanApproval[],
  config: AuthzConfig,
  context: AuthzContext
): GateResolution {
  const accepted: HumanApproval[] = [];
  const rejected: { approval: HumanApproval; rejection: ApprovalRejection }[] =
    [];

  for (const approval of collected) {
    const check = checkApproval(
      requirement,
      accepted,
      approval,
      config,
      context
    );
    if (check.accepted) {
      accepted.push(approval);
    } else {
      rejected.push({ approval, rejection: check.rejection! });
    }
  }

  return { resolved: isSatisfied(requirement, accepted), accepted, rejected };
}
