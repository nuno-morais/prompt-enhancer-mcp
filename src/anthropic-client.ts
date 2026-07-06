import Anthropic from "@anthropic-ai/sdk";
import type { ChatRequest, ChatResponse } from "./llm.js";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required when using the 'anthropic' engine.");
    }
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

export async function anthropicChat(request: ChatRequest): Promise<ChatResponse> {
  const client = getAnthropicClient();
  
  // Extract system message if present
  const systemMsg = request.messages.find(m => m.role === "system");
  const systemText = systemMsg ? systemMsg.content : undefined;
  
  // Filter out system message to get only user/assistant messages for the messages array
  const anthropicMessages = request.messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

  const maxTokens = request.options.num_predict as number | undefined;

  const response = await client.messages.create({
    model: request.model,
    system: systemText,
    messages: anthropicMessages,
    max_tokens: maxTokens ?? 1024,
    temperature: (request.options.temperature as number) ?? 0.2,
    top_p: (request.options.top_p as number) ?? 0.9,
    stop_sequences: request.options.stop as string[] | undefined
  });

  const contentBlock = response.content[0];
  const responseText = contentBlock.type === "text" ? contentBlock.text : "";

  return {
    message: {
      role: "assistant",
      content: responseText
    }
  };
}
