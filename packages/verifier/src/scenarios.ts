import {
  blueprint,
  type AuthTier,
  type AuthzContext,
  type GridNode,
  type GridState,
  type NodeMetrics,
  type NodeStatus,
  type Proposal,
  type Verdict,
} from "@verimesh/shared";

export const BASELINE_METRICS: Omit<NodeMetrics, "ts"> = {
  load: 0.42,
  temp: 46,
  throughput: 1000,
  power: 210,
  mem: 0.38,
  fanRpm: 2100,
};

type BlueprintNode = {
  id: string;
  name: string;
  operator: string;
  pos: number[];
};

export function baselineState(ts: number = 0): GridState {
  const source = blueprint as unknown as {
    nodes: BlueprintNode[];
    edges: GridState["edges"];
  };
  const nodes: GridNode[] = source.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    operator: n.operator,
    pos: [n.pos[0], n.pos[1], n.pos[2]],
    status: "healthy",
    metrics: { ts, ...BASELINE_METRICS },
  }));
  return { nodes, edges: source.edges.map((e) => ({ ...e })) };
}

export interface NodePatch {
  load?: number;
  temp?: number;
  throughput?: number;
  power?: number;
  mem?: number;
  fanRpm?: number;
  status?: NodeStatus;
}

export function patchState(
  state: GridState,
  patches: Record<string, NodePatch>
): GridState {
  return {
    edges: state.edges.map((e) => ({ ...e })),
    nodes: state.nodes.map((node) => {
      const patch = patches[node.id];
      if (!patch) return { ...node, metrics: { ...node.metrics } };
      const { status, ...metrics } = patch;
      return {
        ...node,
        status: status ?? node.status,
        metrics: { ...node.metrics, ...metrics },
      };
    }),
  };
}

export interface ScenarioExpectation {
  verdict: Verdict;
  violationNode?: string;
  operators: string[];
  tier: AuthTier;
  quorum: number;
}

export interface ScenarioVariant {
  id: string;
  label: string;
  proposal?: Proposal;
  context?: AuthzContext;
  expect: ScenarioExpectation;
}

export interface Scenario {
  id: string;
  title: string;
  narrative: string;
  signature: string;
  faults: Record<string, NodePatch>;
  state: () => GridState;
  proposal: Proposal;
  context: AuthzContext;
  expect: ScenarioExpectation;
  variants: ScenarioVariant[];
}

const NO_HISTORY: AuthzContext = { incidentCount: 0, overrideCounts: {} };

const CASCADE_FAULTS: Record<string, NodePatch> = {
  "node-07": { load: 0.88, temp: 78 },
  "node-12": { load: 0.66, temp: 70 },
  "node-11": { status: "offline", load: 0, throughput: 0, power: 0 },
};

const BENIGN_FAULTS: Record<string, NodePatch> = {
  "node-02": { load: 0.88, temp: 74 },
};

const RECURRING_FAULTS: Record<string, NodePatch> = {
  "node-09": { load: 0.88, temp: 74 },
};

export const ambiguousCascade: Scenario = {
  id: "ambiguous_cascade",
  title: "Ambiguous cascade",
  narrative:
    "node-07 (opA) is running hot with falling throughput while its neighbour node-11 has just dropped offline. Rules alone cannot tell a benign load spike from a failure cascade. The agent proposes ISOLATE_NODE; the verifier projects the shed load onto node-12 (opB) and finds a breach. The fix for opA's node damages opB's node, so authorization crosses an operator boundary and demands a two-human quorum.",
  signature: "rising temp + falling throughput + a neighbour offline",
  faults: CASCADE_FAULTS,
  state: () => patchState(baselineState(), CASCADE_FAULTS),
  proposal: {
    diagnosis:
      "node-07 shows thermal runaway with throughput collapse and has lost a neighbour; this looks like a failure cascade rather than a benign spike",
    proposed_action: "ISOLATE_NODE",
    target_nodes: ["node-07"],
    expected_effect: "remove node-07 from the mesh before it degrades further",
    confidence: 0.72,
    risk_flags: ["neighbour_offline", "load_redistribution"],
  },
  context: NO_HISTORY,
  expect: {
    verdict: "VIOLATION_TRIGGERED",
    violationNode: "node-12",
    operators: ["opA", "opB"],
    tier: "T2_QUORUM",
    quorum: 2,
  },
  variants: [
    {
      id: "safe_alternative",
      label: "SCALE_UP — the alternative the humans authorize",
      proposal: {
        diagnosis:
          "node-07 is thermally saturated; adding capacity sheds its load without pushing it onto node-12",
        proposed_action: "SCALE_UP",
        target_nodes: ["node-07"],
        expected_effect: "node-07 cools without loading its neighbours",
        confidence: 0.81,
        risk_flags: [],
      },
      expect: {
        verdict: "VERIFIED",
        operators: ["opA"],
        tier: "T0_AUTONOMOUS",
        quorum: 0,
      },
    },
  ],
};

export const recurringFault: Scenario = {
  id: "recurring_fault",
  title: "Recurring fault",
  narrative:
    "node-09 (opA) shows the same signature the mesh has already seen twice before. The physics are identical to a benign spike and the verifier still returns VERIFIED — but the subgraph remembers the prior incidents, so the same safe action now costs a human signature. History does not just change the diagnosis; it changes how much authority the fix requires.",
  signature: "the benign_spike signature, re-injected on a repeat offender",
  faults: RECURRING_FAULTS,
  state: () => patchState(baselineState(), RECURRING_FAULTS),
  proposal: {
    diagnosis:
      "node-09 load spike with elevated temperature, matching two prior incidents on this node",
    proposed_action: "THROTTLE_NODE",
    target_nodes: ["node-09"],
    expected_effect: "shed load until the node returns to its thermal envelope",
    confidence: 0.88,
    risk_flags: ["repeat_offender"],
  },
  context: { incidentCount: 3, overrideCounts: {} },
  expect: {
    verdict: "VERIFIED",
    operators: ["opA"],
    tier: "T1_SINGLE",
    quorum: 1,
  },
  variants: [
    {
      id: "first_occurrence",
      label: "the same fault with no history — autonomous",
      context: NO_HISTORY,
      expect: {
        verdict: "VERIFIED",
        operators: ["opA"],
        tier: "T0_AUTONOMOUS",
        quorum: 0,
      },
    },
  ],
};

export const benignSpike: Scenario = {
  id: "benign_spike",
  title: "Benign spike",
  narrative:
    "node-02 (opA) takes a load spike with no neighbour loss and no history. THROTTLE_NODE projects clean, the blast radius stays inside one operator, and the agent acts alone. This is the control case that proves the gate is differential rather than always-on.",
  signature: "load spike, no neighbour loss, no history",
  faults: BENIGN_FAULTS,
  state: () => patchState(baselineState(), BENIGN_FAULTS),
  proposal: {
    diagnosis: "node-02 load spike within a recoverable thermal envelope",
    proposed_action: "THROTTLE_NODE",
    target_nodes: ["node-02"],
    expected_effect: "load sheds and the node cools",
    confidence: 0.91,
    risk_flags: [],
  },
  context: NO_HISTORY,
  expect: {
    verdict: "VERIFIED",
    operators: ["opA"],
    tier: "T0_AUTONOMOUS",
    quorum: 0,
  },
  variants: [],
};

export const SCENARIOS: Scenario[] = [
  ambiguousCascade,
  recurringFault,
  benignSpike,
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
