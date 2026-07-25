import { createServer } from "node:http";
import {
  getHistory,
  toHistoryEntries,
} from "@verimesh/chain";

const PORT = Number(process.env.MCP_PORT ?? 8787);
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? "";

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/get_history") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const { nodeId, operator, first } = JSON.parse(body) as {
        nodeId: string;
        operator: string;
        first?: number;
      };

      if (!SUBGRAPH_URL) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "SUBGRAPH_URL not configured", entries: [] }));
        return;
      }

      const result = await getHistory(SUBGRAPH_URL, nodeId, operator, first ?? 10);
      const entries = toHistoryEntries(result);

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ entries, nodeHistory: result.nodeHistory }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message, entries: [] }));
    }
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, subgraph: Boolean(SUBGRAPH_URL) }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[mcp] get_history on :${PORT}`);
});
