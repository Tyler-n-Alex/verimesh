import type {
  AuthorizationRequirement,
  AuthzConfig,
  AuthzContext,
  HumanApproval,
  VerdictResult,
} from "./types";

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

export const requireAuthorization: RequireAuthorization = () => {
  throw new Error("authz.requireAuthorization not implemented (C3.1)");
};

export const checkApproval: CheckApproval = () => {
  throw new Error("authz.checkApproval not implemented (C3.2)");
};

export const isSatisfied: IsSatisfied = () => {
  throw new Error("authz.isSatisfied not implemented (C3.1)");
};
