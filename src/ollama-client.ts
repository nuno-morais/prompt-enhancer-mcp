import { OLLAMA_BASE_URL } from "./config.js";

const OLLAMA_TIMEOUT_MS = 60_000;

export type OllamaChatMessage = {
  role: "system" | "user";
  content: string;
};

export type OllamaChatRequest = {
  model: string;
  messages: OllamaChatMessage[];
  stream: false;
  options: Record<string, unknown>;
};

export type OllamaChatResponse = {
  message: {
    role: string;
    content: string;
  };
};

export async function ollamaChat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<OllamaChatResponse>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
