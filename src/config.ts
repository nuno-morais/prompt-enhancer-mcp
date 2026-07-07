import type { LLMEngine } from "./llm.js";

export const DEFAULT_ENGINE: LLMEngine = "ollama";
export const DEFAULT_MODEL = "qcwind/qwen2.5-7B-instruct-Q4_K_M";

export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

export function getOllamaExtraHeaders(): Record<string, string> {
  const raw = process.env.OLLAMA_EXTRA_HEADERS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "OLLAMA_EXTRA_HEADERS is set but is not valid JSON. Expected a flat object, e.g. " +
      '\'{"CF-Access-Client-Id":"...","CF-Access-Client-Secret":"..."}\''
    );
  }
}

export type TargetModel = "generic" | "claude" | "gpt4o" | "gemini";

export const OLLAMA_BASE_PARAMS = {
  temperature: 0.2,
  top_p: 0.9,
  repeat_penalty: 1.1,
  stop: ["\n```", "</user_draft>", "<user_draft>"]
};

const NUM_PREDICT_BY_MODEL: Record<TargetModel, number> = {
  generic: 384,
  claude: 512,
  gpt4o: 768,
  gemini: 512
};

export function getOllamaParams(targetModel: TargetModel) {
  return {
    ...OLLAMA_BASE_PARAMS,
    num_predict: NUM_PREDICT_BY_MODEL[targetModel]
  };
}
