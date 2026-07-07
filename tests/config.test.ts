import { describe, it, expect, vi, afterEach } from "vitest";
import { getOllamaParams, OLLAMA_BASE_PARAMS, getOllamaBaseUrl, getOllamaExtraHeaders } from "../src/config.js";

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

describe("getOllamaBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to http://localhost:11434 when OLLAMA_BASE_URL is not set", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "");
    expect(getOllamaBaseUrl()).toBe("http://localhost:11434");
  });

  it("returns OLLAMA_BASE_URL when set", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://your-ollama-host.example.com");
    expect(getOllamaBaseUrl()).toBe("https://your-ollama-host.example.com");
  });
});

describe("getOllamaExtraHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an empty object when OLLAMA_EXTRA_HEADERS is not set", () => {
    vi.stubEnv("OLLAMA_EXTRA_HEADERS", "");
    expect(getOllamaExtraHeaders()).toEqual({});
  });

  it("parses a valid JSON object from OLLAMA_EXTRA_HEADERS", () => {
    vi.stubEnv("OLLAMA_EXTRA_HEADERS", '{"CF-Access-Client-Id":"abc","CF-Access-Client-Secret":"xyz"}');
    expect(getOllamaExtraHeaders()).toEqual({
      "CF-Access-Client-Id": "abc",
      "CF-Access-Client-Secret": "xyz"
    });
  });

  it("throws a descriptive error when OLLAMA_EXTRA_HEADERS is invalid JSON", () => {
    vi.stubEnv("OLLAMA_EXTRA_HEADERS", "{not valid json");
    expect(() => getOllamaExtraHeaders()).toThrow(
      'OLLAMA_EXTRA_HEADERS is set but is not valid JSON. Expected a flat object, e.g. \'{"CF-Access-Client-Id":"...","CF-Access-Client-Secret":"..."}\''
    );
  });
});
