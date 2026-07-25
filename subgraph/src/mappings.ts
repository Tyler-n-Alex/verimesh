import { BigInt } from "@graphprotocol/graph-ts";
import {
  Committed,
  Frozen,
  HumanApproval as HumanApprovalEvent,
  OverrideResolved,
} from "../generated/VerimeshRegistry/VerimeshRegistry";
import {
  Approval,
  Decision,
  Freeze,
  HumanAuthority,
  NodeHistory,
  Operator,
  Override,
} from "../generated/schema";

function touchOperator(operatorId: string): Operator {
  let operator = Operator.load(operatorId);
  if (operator == null) {
    operator = new Operator(operatorId);
    operator.decisionCount = 0;
    operator.freezeCount = 0;
    operator.lastDecisionTs = BigInt.zero();
  }
  return operator as Operator;
}

function touchNodeHistory(nodeId: string, operatorId: string): NodeHistory {
  let history = NodeHistory.load(nodeId);
  if (history == null) {
    history = new NodeHistory(nodeId);
    history.nodeId = nodeId;
    history.incidentCount = 0;
    history.violationCount = 0;
    history.lastIncidentTs = BigInt.zero();
  }
  history.operator = operatorId;
  return history as NodeHistory;
}

export function handleCommitted(event: Committed): void {
  let id = event.params.id.toHexString();

  if (Decision.load(id) == null) {
    let decision = new Decision(id);
    decision.nodeId = event.params.nodeId;
    decision.operator = event.params.operator;
    decision.action = event.params.action;
    decision.verdict = event.params.verdict;
    decision.authTier = event.params.authTier;
    decision.humanAuthorized = event.params.authTier > 0;
    decision.zerogRoot = event.params.zerogRoot;
    decision.ts = event.params.ts;
    decision.txHash = event.transaction.hash;
    decision.save();
  }

  let history = touchNodeHistory(event.params.nodeId, event.params.operator);
  history.incidentCount = history.incidentCount + 1;
  if (event.params.verdict != "VERIFIED") {
    history.violationCount = history.violationCount + 1;
  }
  history.lastIncidentTs = event.params.ts;
  history.save();

  let operator = touchOperator(event.params.operator);
  operator.decisionCount = operator.decisionCount + 1;
  operator.lastDecisionTs = event.params.ts;
  operator.save();
}

export function handleFrozen(event: Frozen): void {
  let id = event.transaction.hash
    .concatI32(event.logIndex.toI32())
    .toHexString();

  let freeze = new Freeze(id);
  freeze.decisionId = event.params.id;
  freeze.nodeId = event.params.nodeId;
  freeze.operator = event.params.operator;
  freeze.reason = event.params.reason;
  freeze.requiredTier = event.params.requiredTier;
  freeze.requiredQuorum = event.params.requiredQuorum;
  freeze.ts = event.params.ts;
  freeze.txHash = event.transaction.hash;
  freeze.save();

  let history = touchNodeHistory(event.params.nodeId, event.params.operator);
  history.lastIncidentTs = event.params.ts;
  history.save();

  let operator = touchOperator(event.params.operator);
  operator.freezeCount = operator.freezeCount + 1;
  operator.save();
}

export function handleHumanApproval(event: HumanApprovalEvent): void {
  let id = event.params.id
    .toHexString()
    .concat("-")
    .concat(event.params.approvalIndex.toString());

  let approval = new Approval(id);
  approval.decisionId = event.params.id;
  approval.worldIdNullifier = event.params.worldIdNullifier;
  approval.operator = event.params.operator;
  approval.approvalIndex = event.params.approvalIndex;
  approval.ts = event.params.ts;
  approval.txHash = event.transaction.hash;
  approval.save();

  let nullifierId = event.params.worldIdNullifier.toHexString();
  let authority = HumanAuthority.load(nullifierId);
  if (authority == null) {
    authority = new HumanAuthority(nullifierId);
    authority.worldIdNullifier = event.params.worldIdNullifier;
    authority.overrideCount = 0;
    authority.operators = new Array<string>(0);
  }

  authority.overrideCount = authority.overrideCount + 1;
  authority.lastOverrideTs = event.params.ts;

  let operators = authority.operators;
  if (operators.indexOf(event.params.operator) == -1) {
    operators.push(event.params.operator);
    authority.operators = operators;
  }

  authority.save();
}

export function handleOverrideResolved(event: OverrideResolved): void {
  let id = event.params.id.toHexString();

  if (Override.load(id) != null) return;

  let override = new Override(id);
  override.decisionId = event.params.id;
  override.chosenAction = event.params.chosenAction;
  override.approvalsCollected = event.params.approvalsCollected;
  override.ts = event.params.ts;
  override.txHash = event.transaction.hash;
  override.save();
}
