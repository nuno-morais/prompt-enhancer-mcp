#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt } from "./tool-handler.js";
import { type TargetModel } from "./config.js";

const server = new Server(
  { name: "prompt-enhancer-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [OPTIMIZE_PROMPT_TOOL]
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  if (request.params.name !== "optimize_prompt") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    draft: unknown;
    target_model?: TargetModel;
    brainstorm?: boolean;
    explain?: boolean;
    model?: string;
  };

  const progressToken = request.params._meta?.progressToken;

  return handleOptimizePrompt(
    args,
    progressToken !== undefined
      ? {
          token: progressToken,
          sendNotification: (notification: unknown) =>
            extra.sendNotification(notification as Parameters<typeof extra.sendNotification>[0])
        }
      : undefined
  );
});

const transport = new StdioServerTransport();
await server.connect(transport);
