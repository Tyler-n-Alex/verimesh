export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export interface DemoScenario {
  id: string;
  title: string;
  signature: string;
  narrative: string;
  node: string | null;
  history: "any" | "fresh" | "repeat";
  relocatable: boolean;
  expect: {
    verdict: string;
    tier: string;
    quorum: number;
    operators: string[];
  };
}

export interface DemoApproveOutcome {
  ok: boolean;
  simulated?: boolean;
  error?: string;
  rejection?: string;
  nullifier?: string;
  operator?: string;
  enrolledFor?: string[];
  collected?: number;
  requiredQuorum?: number;
  operatorsCovered?: string[];
  satisfied?: boolean;
}
