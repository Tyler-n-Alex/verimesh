import { z } from "zod";
import { ACTIONS } from "./types";

export const ProposalSchema = z.object({
  diagnosis: z.string().min(1),
  proposed_action: z.enum([...ACTIONS] as [string, ...string[]]),
  target_nodes: z.array(z.string()),
  expected_effect: z.string(),
  confidence: z.number().min(0).max(1),
  risk_flags: z.array(z.string()),
});

export type ProposalInput = z.infer<typeof ProposalSchema>;
