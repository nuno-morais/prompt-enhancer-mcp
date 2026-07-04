import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaChat } from "../src/ollama-client.js";
import { OLLAMA_BASE_URL } from "../src/config.js";

describe("ollamaChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/chat with the given request body and returns the parsed response", async () => {
    const mockResponse = { message: { role: "assistant", content: "```text\nHello\n```" } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      model: "test-model",
      messages: [{ role: "user" as const, content: "hi" }],
      stream: false as const,
      options: { temperature: 0.2 }
    };

    const result = await ollamaChat(request);

    expect(fetchMock).toHaveBeenCalledWith(
      `${OLLAMA_BASE_URL}/api/chat`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error"
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      model: "test-model",
      messages: [{ role: "user" as const, content: "hi" }],
      stream: false as const,
      options: {}
    };

    await expect(ollamaChat(request)).rejects.toThrow("Ollama request failed: 500 Internal Server Error");
  });

  it("rejects with a descriptive error when the request exceeds the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      (_url, options) => {
        if (options?.signal) {
          return new Promise((_, reject) => {
            options.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            });
          });
        }
        return new Promise(() => {}); // never resolves
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      model: "test-model",
      messages: [{ role: "user" as const, content: "hi" }],
      stream: false as const,
      options: {}
    };

    const resultPromise = ollamaChat(request);
    const assertion = expect(resultPromise).rejects.toThrow("Ollama request timed out after 60000ms");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    vi.useRealTimers();
  }, 30_000);
});
