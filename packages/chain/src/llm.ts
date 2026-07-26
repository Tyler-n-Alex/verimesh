import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { ProposalSchema, type ProposalInput } from "@verimesh/shared";
import { withRetry } from "./retry";

export interface ObservationPayload {
  observation_id: string;
  telemetry_window: unknown[];
  topology: unknown;
  history_window: unknown[];
}

export interface LlmResult {
  proposal: ProposalInput;
  provider: string;
  zerogInferenceValid: boolean;
}

const SYSTEM_PROMPT = `You are a deterministic infrastructure control agent. Respond with JSON only, no markdown, matching this schema:
{"diagnosis":"string","proposed_action":"REBALANCE_LOAD|THROTTLE_NODE|ISOLATE_NODE|SCALE_UP|NO_OP","target_nodes":["node-id"],"expected_effect":"string","confidence":0.0,"risk_flags":["string"]}
Choose exactly one action from the menu. Use history when present.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

async function callOpenAi(observation: ObservationPayload): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(observation) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(observation: ObservationPayload): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(observation) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  return data.content.find((c) => c.type === "text")?.text ?? "";
}

async function callZerog(observation: ObservationPayload): Promise<{
  text: string;
  valid: boolean;
}> {
  const rpc = process.env.ZEROG_RPC;
  const privateKey = process.env.ZEROG_PRIVATE_KEY;
  const providerAddress = process.env.ZEROG_COMPUTE_PROVIDER;
  if (!rpc || !privateKey || !providerAddress) {
    throw new Error("0G compute env incomplete");
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(observation) },
  ];

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ messages, model, temperature: 0 }),
  });

  if (!response.ok) {
    throw new Error(`0G compute HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    id?: string;
    choices: { message: { content: string } }[];
  };

  const chatId = response.headers.get("ZG-Res-Key") || data.id;
  const valid = chatId
    ? (await broker.inference.processResponse(providerAddress, chatId)) ?? false
    : false;

  return { text: data.choices[0]?.message?.content ?? "", valid };
}

function heuristicProposal(observation: ObservationPayload): ProposalInput {
  const telemetry = observation.telemetry_window as {
    node_id?: string;
    temp?: number;
    throughput?: number;
    load?: number;
  }[];

  const hottest = telemetry.reduce(
    (best, row) => ((row.temp ?? 0) > (best.temp ?? 0) ? row : best),
    telemetry[0] ?? {}
  );

  const nodeId = hottest.node_id ?? "node-07";
  const history = observation.history_window as { action?: string; verdict?: string }[];
  const priorSafe = history.find(
    (h) => h.verdict === "VERIFIED" && h.action === "SCALE_UP"
  );

  if (priorSafe) {
    return {
      diagnosis: `Repeat thermal stress on ${nodeId}; prior SCALE_UP then ISOLATE succeeded.`,
      proposed_action: "SCALE_UP",
      target_nodes: [nodeId],
      expected_effect: "Add capacity before isolation to protect neighbors.",
      confidence: 0.82,
      risk_flags: ["history_informed"],
    };
  }

  return {
    diagnosis: `Elevated temperature on ${nodeId} with degraded throughput.`,
    proposed_action: "ISOLATE_NODE",
    target_nodes: [nodeId],
    expected_effect: "Remove hot node from the active mesh.",
    confidence: 0.65,
    risk_flags: ["thermal", "throughput"],
  };
}

export async function proposeAction(
  observation: ObservationPayload
): Promise<LlmResult> {
  const provider = process.env.LLM_PROVIDER ?? "heuristic";

  try {
    if (provider === "zerog") {
      const { text, valid } = await withRetry(() => callZerog(observation), {
        label: "0g-llm",
        attempts: 2,
        timeoutMs: Number(process.env.ZEROG_INFERENCE_TIMEOUT_MS ?? 120_000),
      });
      const parsed = ProposalSchema.parse(extractJson(text));
      return { proposal: parsed, provider: "zerog", zerogInferenceValid: valid };
    }

    if (provider === "openai") {
      const text = await withRetry(() => callOpenAi(observation), {
        label: "openai",
        attempts: 2,
      });
      const parsed = ProposalSchema.parse(extractJson(text));
      return { proposal: parsed, provider: "openai", zerogInferenceValid: false };
    }

    if (provider === "anthropic") {
      const text = await withRetry(() => callAnthropic(observation), {
        label: "anthropic",
        attempts: 2,
      });
      const parsed = ProposalSchema.parse(extractJson(text));
      return {
        proposal: parsed,
        provider: "anthropic",
        zerogInferenceValid: false,
      };
    }
  } catch (err) {
    console.error(
      `[llm] ${provider} inference failed, falling back to heuristic — the proposed action and its authorization tier are NOT model-derived:`,
      err instanceof Error ? err.message : err
    );
    const fallback = heuristicProposal(observation);
    return {
      proposal: fallback,
      provider: "heuristic",
      zerogInferenceValid: false,
    };
  }

  const fallback = heuristicProposal(observation);
  return {
    proposal: fallback,
    provider: "heuristic",
    zerogInferenceValid: false,
  };
}
