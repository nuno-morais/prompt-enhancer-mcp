#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OPTIMIZE_PROMPT_TOOL, handleOptimizePrompt } from "./tool-handler.js";
import { CHECK_HEALTH_TOOL, handleCheckHealth } from "./health.js";
import { LINT_PROMPT_TOOL, handleLintPrompt } from "./lint-tool.js";
import { SCORE_PROMPT_TOOL, handleScorePrompt } from "./score.js";
import { type TargetModel } from "./config.js";
import { registerSamplingServer } from "./sampling-client.js";

const server = new Server(
  { name: "prompt-enhancer-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

registerSamplingServer(server);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [OPTIMIZE_PROMPT_TOOL, CHECK_HEALTH_TOOL, LINT_PROMPT_TOOL, SCORE_PROMPT_TOOL]
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  if (request.params.name === "check_health") {
    return handleCheckHealth(request.params.arguments as { engine?: string; model?: string });
  }

  if (request.params.name === "lint_prompt") {
    return handleLintPrompt(request.params.arguments as { prompt: unknown; draft?: string; context?: string });
  }

  if (request.params.name === "score_prompt") {
    return await handleScorePrompt(request.params.arguments as {
      prompt: unknown; baseline?: string; target_model?: TargetModel; engine?: string; model?: string;
    });
  }

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
