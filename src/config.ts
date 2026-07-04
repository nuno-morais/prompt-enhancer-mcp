export const DEFAULT_MODEL = "qcwind/qwen2.5-7B-instruct-Q4_K_M";

export const OLLAMA_BASE_URL = "http://localhost:11434";

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
