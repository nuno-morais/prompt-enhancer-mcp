import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
import { handleCheckHealth } from "../src/health.js";
import { OLLAMA_BASE_URL, DEFAULT_MODEL } from "../src/config.js";

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

    expect(fetchMock).toHaveBeenCalledWith(`${OLLAMA_BASE_URL}/api/tags`);
    expect(result.content).toEqual([
      { type: "text", text: `✅ Ollama reachable at ${OLLAMA_BASE_URL}, model '${DEFAULT_MODEL}' available.` }
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
      { type: "text", text: `⚠️ Ollama is reachable at ${OLLAMA_BASE_URL}, but model '${DEFAULT_MODEL}' is not pulled. Run: ollama pull ${DEFAULT_MODEL}` }
    ]);
  });

  it("reports Ollama unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleCheckHealth({ engine: "ollama" });

    expect(result.content).toEqual([
      { type: "text", text: `❌ Could not reach Ollama at ${OLLAMA_BASE_URL}. Is Ollama running? Try 'ollama serve'.` }
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
      { type: "text", text: `❌ Ollama at ${OLLAMA_BASE_URL} responded with an error: 500 Internal Server Error` }
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
      { type: "text", text: `✅ Ollama reachable at ${OLLAMA_BASE_URL}, model 'custom-model:latest' available.` }
    ]);
  });
});
