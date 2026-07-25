import { z } from "zod";
import { ACTIONS } from "./types";
import type { GridState } from "./types";

export const ProposalSchema = z.object({
  diagnosis: z.string().min(1),
  proposed_action: z.enum(ACTIONS),
  target_nodes: z.array(z.string()),
  expected_effect: z.string(),
  confidence: z.number().min(0).max(1),
  risk_flags: z.array(z.string()),
});

export type ProposalInput = z.infer<typeof ProposalSchema>;

export type SemanticError =
  | "ISOLATE_REQUIRES_ONE_TARGET"
  | "REBALANCE_REQUIRES_TWO_TARGETS"
  | "NO_OP_REQUIRES_EMPTY_TARGETS"
  | "TARGET_NOT_IN_TOPOLOGY";

export function validateProposalSemantics(
  proposal: ProposalInput,
  state: GridState
): SemanticError | null {
  const nodeIds = new Set(state.nodes.map((n) => n.id));
  const action = proposal.proposed_action;
  const targets = proposal.target_nodes;

  if (action === "ISOLATE_NODE" && targets.length !== 1) {
    return "ISOLATE_REQUIRES_ONE_TARGET";
  }
  if (action === "REBALANCE_LOAD" && targets.length < 2) {
    return "REBALANCE_REQUIRES_TWO_TARGETS";
  }
  if (action === "NO_OP" && targets.length > 0) {
    return "NO_OP_REQUIRES_EMPTY_TARGETS";
  }
  if (
    (action === "SCALE_UP" || action === "THROTTLE_NODE") &&
    targets.some((id) => !nodeIds.has(id))
  ) {
    return "TARGET_NOT_IN_TOPOLOGY";
  }
  if (
    (action === "ISOLATE_NODE" || action === "REBALANCE_LOAD") &&
    targets.some((id) => !nodeIds.has(id))
  ) {
    return "TARGET_NOT_IN_TOPOLOGY";
  }
  return null;
}
