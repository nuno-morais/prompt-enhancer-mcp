// src/server.ts
import http from "http";
import { handleOptimizePrompt } from "./tool-handler.js";
import { URL } from "url";

const PORT = Number(process.env.MCP_HTTP_PORT) || 3000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/optimize") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body);
      if (!payload.draft || typeof payload.draft !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request payload: 'draft' is required" }));
        return;
      }
      const result = await handleOptimizePrompt(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal optimisation error" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Prompt‑Enhancer MCP HTTP server listening on http://localhost:${PORT}`);
});
