import { ollamaChat } from "./ollama-client.js";
import { anthropicChat } from "./anthropic-client.js";
import { samplingChat } from "./sampling-client.js";

export type LLMEngine = "ollama" | "anthropic" | "sampling";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  engine: LLMEngine;
  model: string;
  messages: ChatMessage[];
  options: Record<string, unknown>;
};

export type ChatResponse = {
  message: {
    role: "assistant";
    content: string;
  };
};

// Anthropic and MCP sampling both take the system prompt out-of-band rather
// than as a message; this splits it off for those adapters.
export function splitSystemMessage(messages: ChatMessage[]): {
  system: string | undefined;
  rest: ChatMessage[];
} {
  return {
    system: messages.find(m => m.role === "system")?.content,
    rest: messages.filter(m => m.role !== "system")
  };
}

export async function generateChat(request: ChatRequest): Promise<ChatResponse> {
  if (request.engine === "sampling") {
    return samplingChat(request);
  }
  if (request.engine === "anthropic") {
    return anthropicChat(request);
  }

  // Default to Ollama
  const res = await ollamaChat({
    model: request.model,
    messages: request.messages,
    stream: false,
    options: request.options
  });
  
  return res as ChatResponse;
}
