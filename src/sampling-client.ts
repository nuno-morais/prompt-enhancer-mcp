import { splitSystemMessage, type ChatRequest, type ChatResponse } from "./llm.js";

export const SAMPLING_UNSUPPORTED_MESSAGE =
  'This client doesn\'t support MCP sampling; use engine "ollama" or "anthropic".';

export type SamplingServer = {
  getClientCapabilities(): { sampling?: object } | undefined;
  createMessage(params: object): Promise<{ content: { type: string; text?: string }; model?: string }>;
};

let registeredServer: SamplingServer | undefined;

export function registerSamplingServer(server: SamplingServer): void {
  registeredServer = server;
}

export function _resetForTests(): void {
  registeredServer = undefined;
}

export function samplingAvailable(): boolean {
  return Boolean(registeredServer?.getClientCapabilities()?.sampling);
}

export async function samplingChat(request: ChatRequest): Promise<ChatResponse> {
  if (!samplingAvailable()) {
    throw new Error(SAMPLING_UNSUPPORTED_MESSAGE);
  }
  const { system: systemPrompt, rest } = splitSystemMessage(request.messages);
  const messages = rest.map(m => ({ role: m.role, content: { type: "text", text: m.content } }));

  const result = await registeredServer!.createMessage({
    messages,
    systemPrompt,
    maxTokens: typeof request.options.num_predict === "number" ? request.options.num_predict : 4096,
    temperature: typeof request.options.temperature === "number" ? request.options.temperature : undefined,
    modelPreferences: { hints: [{ name: request.model }] }
  });

  if (result.content.type !== "text" || typeof result.content.text !== "string") {
    throw new Error("Sampling response did not contain text content");
  }
  return { message: { role: "assistant", content: result.content.text } };
}
