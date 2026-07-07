import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
import { handleCheckHealth } from "../src/health.js";
import { getOllamaBaseUrl, DEFAULT_MODEL } from "../src/config.js";

describe("handleCheckHealth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports Anthropic configured when ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");

    const result = await handleCheckHealth({ engine: "anthropic" });

    expect(result.content).toEqual([
      { type: "text", text: "✅ Anthropic engine configured (ANTHROPIC_API_KEY is set)." }
    ]);
  });

  it("reports Anthropic not configured when ANTHROPIC_API_KEY is unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    delete process.env.ANTHROPIC_API_KEY;

    const result = await handleCheckHealth({ engine: "anthropic" });

    expect(result.content).toEqual([
      { type: "text", text: "❌ Anthropic engine not configured: ANTHROPIC_API_KEY environment variable is not set." }
    ]);
  });

  it("reports Ollama reachable and model available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: `${DEFAULT_MODEL}:latest`, model: `${DEFAULT_MODEL}:latest` }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleCheckHealth({ engine: "ollama" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${getOllamaBaseUrl()}/api/tags`,
      expect.objectContaining({ headers: {} })
    );
    expect(result.content).toEqual([
      { type: "text", text: `✅ Ollama reachable at ${getOllamaBaseUrl()}, model '${DEFAULT_MODEL}' available.` }
    ]);
  });

  it("reports Ollama reachable but model not pulled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: "some-other-model:latest", model: "some-other-model:latest" }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleCheckHealth({ engine: "ollama" });

    expect(result.content).toEqual([
      { type: "text", text: `⚠️ Ollama is reachable at ${getOllamaBaseUrl()}, but model '${DEFAULT_MODEL}' is not pulled. Run: ollama pull ${DEFAULT_MODEL}` }
    ]);
  });

  it("reports Ollama unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleCheckHealth({ engine: "ollama" });

    expect(result.content).toEqual([
      { type: "text", text: `❌ Could not reach Ollama at ${getOllamaBaseUrl()}. Is Ollama running? Try 'ollama serve'.` }
    ]);
  });

  it("reports a non-OK Ollama response with status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error"
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleCheckHealth({ engine: "ollama" });

    expect(result.content).toEqual([
      { type: "text", text: `❌ Ollama at ${getOllamaBaseUrl()} responded with an error: 500 Internal Server Error` }
    ]);
  });

  it("uses the model arg override instead of the default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: "custom-model:latest", model: "custom-model:latest" }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleCheckHealth({ engine: "ollama", model: "custom-model:latest" });

    expect(result.content).toEqual([
      { type: "text", text: `✅ Ollama reachable at ${getOllamaBaseUrl()}, model 'custom-model:latest' available.` }
    ]);
  });

  it("includes OLLAMA_EXTRA_HEADERS in the /api/tags request", async () => {
    vi.stubEnv("OLLAMA_EXTRA_HEADERS", '{"CF-Access-Client-Id":"abc","CF-Access-Client-Secret":"xyz"}');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: `${DEFAULT_MODEL}:latest`, model: `${DEFAULT_MODEL}:latest` }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    await handleCheckHealth({ engine: "ollama" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          "CF-Access-Client-Id": "abc",
          "CF-Access-Client-Secret": "xyz"
        }
      })
    );
  });
});
