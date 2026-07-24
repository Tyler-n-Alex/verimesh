import type { GridState, Proposal, Settlement } from "./types";
import blueprint from "./genio_blueprint.json";

type EconomyPolicy = {
  price: number;
  settlementCapFactor: number;
  defaultBalance: number;
  defaultBudgetFloor: number;
  defaultEarnRate: number;
};

const policy = (blueprint as { economy: EconomyPolicy }).economy;

export function settlementCap(loadMoved: number): number {
  return policy.price * loadMoved * policy.settlementCapFactor;
}

export function settle(state: GridState, action: Proposal): Settlement[] {
  const settlements: Settlement[] = [];
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
  for (const targetId of action.target_nodes) {
    const target = nodeById.get(targetId);
    if (!target) continue;
    const load = target.metrics.load;
    if (action.proposed_action === "SCALE_UP") {
      settlements.push({
        from: "treasury",
        to: targetId,
        amount: policy.price * load,
        reason: action.proposed_action,
      });
    } else if (
      action.proposed_action === "REBALANCE_LOAD" ||
      action.proposed_action === "ISOLATE_NODE"
    ) {
      const edge = state.edges.find((e) => e.from === targetId);
      const absorber = edge ? edge.to : targetId;
      settlements.push({
        from: targetId,
        to: absorber,
        amount: policy.price * load,
        reason: action.proposed_action,
      });
    }
  }
  return settlements;
}
