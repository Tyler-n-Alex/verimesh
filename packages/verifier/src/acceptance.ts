import { createHash } from "node:crypto";
import {
  AUTH_TIER_CODE,
  authzConfig,
  distinctNullifiers,
  isEnrolled,
  isSatisfied,
  normalizeNullifier,
  DEMO_SIGNER_SEED,
  type AuthzConfig,
  type AuthorizationRequirement,
  type DecisionRecord,
  type HumanApproval,
} from "@verimesh/shared";

const SEEDED_NULLIFIERS = new Set([
  "0x00000000000000000000000000000000000000000000000000000000000a11ce",
  "0x0000000000000000000000000000000000000000000000000000000000000b0b",
]);

function demoSignerFor(operator: string): string {
  return `0x${createHash("sha256")
    .update(`${DEMO_SIGNER_SEED}:${operator}`)
    .digest("hex")}`;
}

function offAllowlistCause(nullifier: string, operator: string): string {
  const value = nullifier.toLowerCase();
  if (SEEDED_NULLIFIERS.has(value)) {
    return "seeded by contracts/seed-event.mjs — never a real human";
  }
  if (value === demoSignerFor(operator).toLowerCase()) {
    return "NEXT_PUBLIC_DEMO_MODE simulated signer — no personhood was proven";
  }
  return "UNEXPLAINED — a signer that is neither seeded nor simulated";
}

export type GraphQLFetch = (
  query: string,
  variables: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export interface CheckResult {
  check: string;
  subject: string;
  ok: boolean;
  detail: string;
  mismatches: string[];
}

export interface AcceptanceReport {
  ok: boolean;
  results: CheckResult[];
  red: CheckResult[];
}

export interface ResolvedGate {
  decisionId: string;
  chosenAction: string;
  requirement: AuthorizationRequirement;
  approvals: HumanApproval[];
  requirementSource?: "gate-record" | "chain-derived";
}

export interface AcceptanceInput {
  decisions: DecisionRecord[];
  gates: ResolvedGate[];
}

export const DECISION_TRUTH_QUERY = `
query DecisionTruth($decisionId: ID!) {
  decisions(where: { id: $decisionId }) {
    id
    nodeId
    operator
    action
    verdict
    authTier
    humanAuthorized
    zerogRoot
    ts
    txHash
  }
}
`;

export const QUORUM_TRUTH_QUERY = `
query QuorumTruth($decisionId: Bytes!) {
  approvals(
    where: { decisionId: $decisionId }
    orderBy: approvalIndex
    orderDirection: asc
  ) {
    id
    worldIdNullifier
    operator
    approvalIndex
    ts
    txHash
  }
  overrides(where: { decisionId: $decisionId }) {
    id
    chosenAction
    approvalsCollected
    ts
    txHash
  }
}
`;

interface IndexedDecision {
  id: string;
  nodeId: string;
  operator: string;
  action: string;
  verdict: string;
  authTier: number;
  humanAuthorized: boolean;
  zerogRoot: string | null;
  ts: string;
  txHash: string;
}

interface IndexedApproval {
  id: string;
  worldIdNullifier: string;
  operator: string;
  approvalIndex: number;
  ts: string;
  txHash: string;
}

interface IndexedOverride {
  id: string;
  chosenAction: string;
  approvalsCollected: number;
  ts: string;
  txHash: string;
}

function safeNormalize(value: string): string | null {
  try {
    return normalizeNullifier(value);
  } catch {
    return null;
  }
}

function sameHex(a: string | null | undefined, b: string | null | undefined) {
  const left = (a ?? "").toLowerCase();
  const right = (b ?? "").toLowerCase();
  if (left.length === 0 && right.length === 0) return true;
  return left === right;
}

function compare(
  mismatches: string[],
  field: string,
  expected: unknown,
  actual: unknown
): void {
  if (expected !== actual) {
    mismatches.push(`${field}: expected ${String(expected)}, indexed ${String(actual)}`);
  }
}

export async function subgraphTruthCheck(
  decisions: DecisionRecord[],
  fetchGql: GraphQLFetch
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const record of decisions) {
    const mismatches: string[] = [];
    let indexed: IndexedDecision | undefined;

    try {
      const data = (await fetchGql(DECISION_TRUTH_QUERY, {
        decisionId: record.id.toLowerCase(),
      })) as { decisions?: IndexedDecision[] };
      indexed = data.decisions?.[0];
    } catch (err) {
      results.push({
        check: "C5.1 subgraph-truth",
        subject: record.id,
        ok: false,
        detail: `query failed: ${err instanceof Error ? err.message : String(err)}`,
        mismatches: [],
      });
      continue;
    }

    if (!indexed) {
      results.push({
        check: "C5.1 subgraph-truth",
        subject: record.id,
        ok: false,
        detail: "committed on-chain but absent from the subgraph",
        mismatches: [],
      });
      continue;
    }

    compare(mismatches, "nodeId", record.nodeId, indexed.nodeId);
    compare(mismatches, "operator", record.operator, indexed.operator);
    compare(mismatches, "action", record.action, indexed.action);
    compare(mismatches, "verdict", record.verdict, indexed.verdict);
    compare(
      mismatches,
      "authTier",
      AUTH_TIER_CODE[record.authTier],
      Number(indexed.authTier)
    );
    compare(
      mismatches,
      "humanAuthorized",
      record.humanAuthorized,
      indexed.humanAuthorized
    );

    if (record.zerogRoot && !sameHex(record.zerogRoot, indexed.zerogRoot)) {
      mismatches.push(
        `zerogRoot: expected ${record.zerogRoot}, indexed ${indexed.zerogRoot ?? "null"}`
      );
    }
    if (record.chainTxHash && !sameHex(record.chainTxHash, indexed.txHash)) {
      mismatches.push(
        `txHash: expected ${record.chainTxHash}, indexed ${indexed.txHash}`
      );
    }

    results.push({
      check: "C5.1 subgraph-truth",
      subject: record.id,
      ok: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? "what the agent remembers matches what was committed"
          : `${mismatches.length} field(s) disagree with the chain`,
      mismatches,
    });
  }

  return results;
}

export async function quorumTruthCheck(
  gates: ResolvedGate[],
  fetchGql: GraphQLFetch
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const gate of gates) {
    const mismatches: string[] = [];
    let approvals: IndexedApproval[] = [];
    let overrides: IndexedOverride[] = [];

    try {
      const data = (await fetchGql(QUORUM_TRUTH_QUERY, {
        decisionId: gate.decisionId.toLowerCase(),
      })) as { approvals?: IndexedApproval[]; overrides?: IndexedOverride[] };
      approvals = data.approvals ?? [];
      overrides = data.overrides ?? [];
    } catch (err) {
      results.push({
        check: "C5.2 quorum-truth",
        subject: gate.decisionId,
        ok: false,
        detail: `query failed: ${err instanceof Error ? err.message : String(err)}`,
        mismatches: [],
      });
      continue;
    }

    const demandedRaw = gate.approvals.map((approval) =>
      safeNormalize(approval.nullifier)
    );
    if (demandedRaw.some((value) => value === null)) {
      mismatches.push(
        "the policy's own approval set contains a nullifier that is not a valid hex value"
      );
    }
    const demanded = Array.from(
      new Set(demandedRaw.filter((value): value is string => value !== null))
    ).sort();

    const onChainRaw = approvals.map((approval) =>
      safeNormalize(approval.worldIdNullifier)
    );
    for (const [index, value] of onChainRaw.entries()) {
      if (value === null) {
        mismatches.push(
          `the chain recorded an unparseable nullifier at approvalIndex ${approvals[index].approvalIndex}: ${approvals[index].worldIdNullifier}`
        );
      }
    }
    const parsedOnChain = onChainRaw.filter(
      (value): value is string => value !== null
    );
    const onChain = Array.from(new Set(parsedOnChain)).sort();

    if (parsedOnChain.length !== onChain.length) {
      mismatches.push(
        `the chain recorded ${parsedOnChain.length} approvals but only ${onChain.length} distinct humans`
      );
    }

    for (const nullifier of demanded) {
      if (!onChain.includes(nullifier)) {
        mismatches.push(`policy accepted ${nullifier} but the chain has no HumanApproval for it`);
      }
    }
    for (const nullifier of onChain) {
      if (!demanded.includes(nullifier)) {
        mismatches.push(`chain authorized ${nullifier} but the policy never accepted it`);
      }
    }

    if (onChain.length < gate.requirement.quorum) {
      mismatches.push(
        `quorum: policy demanded ${gate.requirement.quorum} distinct humans, chain has ${onChain.length}`
      );
    }

    const chainApprovals: HumanApproval[] = approvals
      .map((approval, index) => ({
        nullifier: onChainRaw[index],
        operator: approval.operator,
        chosenAction: gate.chosenAction,
        ts: Number(approval.ts),
      }))
      .filter(
        (approval): approval is HumanApproval => approval.nullifier !== null
      );

    if (!isSatisfied(gate.requirement, chainApprovals)) {
      mismatches.push(
        "the approvals recorded on-chain do not satisfy the requirement the policy issued"
      );
    }

    for (const approval of chainApprovals) {
      if (
        gate.requirement.operatorsRequired.length > 0 &&
        !gate.requirement.operatorsRequired.includes(approval.operator)
      ) {
        mismatches.push(
          `chain recorded an approval for ${approval.operator}, which the policy never required`
        );
      }
    }

    if (gate.requirementSource !== "gate-record") {
      mismatches.push(
        "requirement was reconstructed from the chain, so operatorsRequired is not independently checked — feed the harness from human_gates to close this"
      );
    }

    const override = overrides[0];
    if (!override) {
      mismatches.push("no OverrideResolved event was indexed for this gate");
    } else {
      compare(
        mismatches,
        "chosenAction",
        gate.chosenAction,
        override.chosenAction
      );
      compare(
        mismatches,
        "approvalsCollected",
        approvals.length,
        Number(override.approvalsCollected)
      );
    }

    results.push({
      check: "C5.2 quorum-truth",
      subject: gate.decisionId,
      ok: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? `chain records exactly the ${onChain.length} distinct human(s) the policy demanded`
          : `${mismatches.length} disagreement(s) between the policy and the chain`,
      mismatches,
    });
  }

  return results;
}

export const AUTHORIZED_DECISIONS_QUERY = `
query AuthorizedDecisions($first: Int = 100) {
  decisions(where: { humanAuthorized: true }, first: $first) {
    id
    nodeId
    operator
    action
    authTier
    ts
  }
  approvals(first: 500) {
    decisionId
    worldIdNullifier
    operator
  }
}
`;

export async function authorizationTraceCheck(
  fetchGql: GraphQLFetch
): Promise<CheckResult[]> {
  let decisions: { id: string; nodeId: string; authTier: number }[] = [];
  let approvals: { decisionId: string }[] = [];

  try {
    const data = (await fetchGql(AUTHORIZED_DECISIONS_QUERY, {})) as {
      decisions?: { id: string; nodeId: string; authTier: number }[];
      approvals?: { decisionId: string }[];
    };
    decisions = data.decisions ?? [];
    approvals = data.approvals ?? [];
  } catch (err) {
    return [
      {
        check: "C5.2 authorization-trace",
        subject: "all human-authorized decisions",
        ok: false,
        detail: `query failed: ${err instanceof Error ? err.message : String(err)}`,
        mismatches: [],
      },
    ];
  }

  const approvedIds = new Set(
    approvals.map((approval) => approval.decisionId.toLowerCase())
  );

  const orphans = decisions.filter(
    (decision) => !approvedIds.has(decision.id.toLowerCase())
  );

  return [
    {
      check: "C5.2 authorization-trace",
      subject: `${decisions.length} human-authorized decision(s)`,
      ok: orphans.length === 0,
      detail:
        orphans.length === 0
          ? "every decision that claims a human authorized it has HumanApproval events to prove it"
          : `${orphans.length} decision(s) claim human authorization with no HumanApproval on-chain — resolveOverride was never called for them`,
      mismatches: orphans.map(
        (decision) =>
          `${decision.id} (${decision.nodeId}, tier ${decision.authTier}) has humanAuthorized=true but zero indexed approvals`
      ),
    },
  ];
}

export const POLICY_ENFORCEMENT_QUERY = `
query PolicyEnforcement($first: Int = 500) {
  approvals(first: $first) {
    id
    decisionId
    worldIdNullifier
    operator
  }
  humanAuthorities(first: $first) {
    worldIdNullifier
    overrideCount
    operators
  }
}
`;

export async function policyEnforcementCheck(
  fetchGql: GraphQLFetch,
  config: AuthzConfig = authzConfig as AuthzConfig
): Promise<CheckResult[]> {
  let approvals: IndexedApproval[] = [];
  let authorities: { worldIdNullifier: string; overrideCount: number }[] = [];

  try {
    const data = (await fetchGql(POLICY_ENFORCEMENT_QUERY, {})) as {
      approvals?: IndexedApproval[];
      humanAuthorities?: { worldIdNullifier: string; overrideCount: number }[];
    };
    approvals = data.approvals ?? [];
    authorities = data.humanAuthorities ?? [];
  } catch (err) {
    const detail = `query failed: ${err instanceof Error ? err.message : String(err)}`;
    return [
      { check: "C5.2 allowlist-truth", subject: "all indexed approvals", ok: false, detail, mismatches: [] },
      { check: "C5.2 budget-truth", subject: "all indexed humans", ok: false, detail, mismatches: [] },
    ];
  }

  const enrolled = Object.values(config.operators).flat().length;

  const offAllowlist = approvals.filter(
    (approval) => !isEnrolled(config, approval.operator, approval.worldIdNullifier)
  );

  const allowlistResult: CheckResult = {
    check: "C5.2 allowlist-truth",
    subject: `${approvals.length} indexed approval(s)`,
    ok: enrolled > 0 && offAllowlist.length === 0,
    detail:
      enrolled === 0
        ? "authz_config has no enrolled nullifiers at all, so nothing on-chain can be shown to have been authorized by an entitled human (B5.6)"
        : offAllowlist.length === 0
          ? "every human recorded on-chain was enrolled to the operator they signed for"
          : `${offAllowlist.length} on-chain approval(s) came from a human not on that operator's allowlist — ${
              offAllowlist.filter(
                (approval) =>
                  offAllowlistCause(
                    approval.worldIdNullifier,
                    approval.operator
                  ).startsWith("UNEXPLAINED")
              ).length
            } unexplained, the rest seeded or simulated`,
    mismatches: offAllowlist.map(
      (approval) =>
        `${approval.worldIdNullifier} signed for ${approval.operator} but is not enrolled to it — ${offAllowlistCause(approval.worldIdNullifier, approval.operator)}`
    ),
  };

  const overBudget = authorities.filter(
    (authority) => authority.overrideCount > config.budgetPerWindow
  );

  const budgetResult: CheckResult = {
    check: "C5.2 budget-truth",
    subject: `${authorities.length} indexed human(s)`,
    ok: overBudget.length === 0,
    detail:
      overBudget.length === 0
        ? `no human exceeded the ${config.budgetPerWindow}-override budget`
        : `${overBudget.length} human(s) authorized more overrides than the budget allows`,
    mismatches: overBudget.map(
      (authority) =>
        `${authority.worldIdNullifier} has ${authority.overrideCount} overrides against a budget of ${config.budgetPerWindow}`
    ),
  };

  return [allowlistResult, budgetResult];
}

export async function runAcceptance(
  input: AcceptanceInput,
  fetchGql: GraphQLFetch,
  config: AuthzConfig = authzConfig as AuthzConfig
): Promise<AcceptanceReport> {
  const results = [
    ...(await subgraphTruthCheck(input.decisions, fetchGql)),
    ...(await quorumTruthCheck(input.gates, fetchGql)),
    ...(await authorizationTraceCheck(fetchGql)),
    ...(await policyEnforcementCheck(fetchGql, config)),
  ];
  const red = results.filter((result) => !result.ok);
  return { ok: red.length === 0, results, red };
}

export function createSubgraphFetch(url: string): GraphQLFetch {
  return async (query, variables) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      throw new Error(`subgraph HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      data?: Record<string, unknown>;
      errors?: { message: string }[];
    };

    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }

    return body.data ?? {};
  };
}

export function formatReport(report: AcceptanceReport): string {
  const lines = report.results.map((result) => {
    const head = `${result.ok ? "PASS" : "FAIL"}  ${result.check}  ${result.subject}  ${result.detail}`;
    const detail = result.mismatches.map((m) => `        ${m}`);
    return [head, ...detail].join("\n");
  });
  lines.push(
    report.ok
      ? `\n${report.results.length} check(s) green — the demo is honest.`
      : `\n${report.red.length} of ${report.results.length} check(s) RED — publish this in the Blockers table.`
  );
  return lines.join("\n");
}
