import { describe, it, expect, vi, afterEach } from "vitest";
import { requiresCoT, injectCoT } from "../src/cot-injector.js";
import * as llm from "../src/llm.js";

describe("requiresCoT", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when the classifier answers YES", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "YES" }
    });

    expect(await requiresCoT("draft", "model", "ollama", {})).toBe(true);
  });

  it("returns true for a lowercase 'yes' (case-insensitive)", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "yes" }
    });

    expect(await requiresCoT("draft", "model", "ollama", {})).toBe(true);
  });

  it("returns false when the classifier answers NO", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "NO" }
    });

    expect(await requiresCoT("draft", "model", "ollama", {})).toBe(false);
  });

  it("returns false and does not throw when the LLM call rejects", async () => {
    vi.spyOn(llm, "generateChat").mockRejectedValue(new Error("network error"));

    expect(await requiresCoT("draft", "model", "ollama", {})).toBe(false);
  });
});

describe("injectCoT", () => {
  it("appends Claude-specific <thinking>/<answer> instructions for target 'claude'", () => {
    const result = injectCoT("Solve this.", "claude");
    expect(result).toContain("<thinking>");
    expect(result).toContain("<answer>");
    expect(result.startsWith("Solve this.\n\n")).toBe(true);
  });

  it("appends Gemini-specific <scratchpad> instructions for target 'gemini'", () => {
    const result = injectCoT("Solve this.", "gemini");
    expect(result).toContain("<scratchpad>");
  });

  it("appends plain step-by-step instructions for target 'gpt4o'", () => {
    const result = injectCoT("Solve this.", "gpt4o");
    expect(result).toContain("Think step-by-step");
  });

  it("appends generic step-by-step instructions for target 'generic'", () => {
    const result = injectCoT("Solve this.", "generic");
    expect(result).toContain("think through this problem step-by-step");
  });

  it("is a no-op when the prompt already contains <thinking>", () => {
    const prompt = "Solve this.\n\n<thinking>already planned</thinking>";
    expect(injectCoT(prompt, "claude")).toBe(prompt);
  });

  it("is a no-op when the prompt already contains 'step-by-step' (case-insensitive)", () => {
    const prompt = "Solve this Step-By-Step, please.";
    expect(injectCoT(prompt, "generic")).toBe(prompt);
  });

  it("is a no-op when the prompt already contains <scratchpad>", () => {
    const prompt = "Solve this.\n\n<scratchpad>notes</scratchpad>";
    expect(injectCoT(prompt, "gemini")).toBe(prompt);
  });
});
