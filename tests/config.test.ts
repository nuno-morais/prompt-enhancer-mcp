import { describe, it, expect } from "vitest";
import { getOllamaParams, OLLAMA_BASE_PARAMS } from "../src/config.js";

describe("getOllamaParams", () => {
  it("returns num_predict: 384 for generic target model", () => {
    expect(getOllamaParams("generic").num_predict).toBe(384);
  });

  it("returns num_predict: 512 for claude target model", () => {
    expect(getOllamaParams("claude").num_predict).toBe(512);
  });

  it("returns num_predict: 768 for gpt4o target model", () => {
    expect(getOllamaParams("gpt4o").num_predict).toBe(768);
  });

  it("returns num_predict: 512 for gemini target model", () => {
    expect(getOllamaParams("gemini").num_predict).toBe(512);
  });

  it("shares identical temperature, top_p, repeat_penalty, and stop across all target models", () => {
    const generic = getOllamaParams("generic");
    const claude = getOllamaParams("claude");
    const gpt4o = getOllamaParams("gpt4o");
    const gemini = getOllamaParams("gemini");

    for (const params of [generic, claude, gpt4o, gemini]) {
      expect(params.temperature).toBe(OLLAMA_BASE_PARAMS.temperature);
      expect(params.top_p).toBe(OLLAMA_BASE_PARAMS.top_p);
      expect(params.repeat_penalty).toBe(OLLAMA_BASE_PARAMS.repeat_penalty);
      expect(params.stop).toEqual(OLLAMA_BASE_PARAMS.stop);
    }
  });
});
