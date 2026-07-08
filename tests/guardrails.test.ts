import { describe, it, expect, vi, afterEach } from "vitest";
import { generateNegativeConstraints, injectGuardrails } from "../src/guardrails.js";
import * as llm from "../src/llm.js";

describe("generateNegativeConstraints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a valid '- DO NOT' bulleted list into an array", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: {
        role: "assistant",
        content: "- DO NOT invent facts.\n- DO NOT add filler text."
      }
    });

    const result = await generateNegativeConstraints("draft", "model", "ollama", {});

    expect(result).toEqual(["- DO NOT invent facts.", "- DO NOT add filler text."]);
  });

  it("returns null when the response has no '- DO NOT' marker", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "I don't have any constraints to add." }
    });

    const result = await generateNegativeConstraints("draft", "model", "ollama", {});

    expect(result).toBeNull();
  });

  it("returns null when the response is empty", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "" }
    });

    const result = await generateNegativeConstraints("draft", "model", "ollama", {});

    expect(result).toBeNull();
  });

  it("returns null and does not throw when the LLM call rejects", async () => {
    vi.spyOn(llm, "generateChat").mockRejectedValue(new Error("network error"));

    const result = await generateNegativeConstraints("draft", "model", "ollama", {});

    expect(result).toBeNull();
  });

  it("filters out non-'- DO NOT' lines mixed into the response", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: {
        role: "assistant",
        content: "Here are some constraints:\n- DO NOT hallucinate.\nThat's it."
      }
    });

    const result = await generateNegativeConstraints("draft", "model", "ollama", {});

    expect(result).toEqual(["- DO NOT hallucinate."]);
  });
});

describe("injectGuardrails", () => {
  it("appends a <negative_constraints> block to the prompt", () => {
    const result = injectGuardrails("Do the task.", ["- DO NOT lie.", "- DO NOT stall."]);

    expect(result).toBe(
      "Do the task.\n\n<negative_constraints>\n- DO NOT lie.\n- DO NOT stall.\n</negative_constraints>"
    );
  });

  it("is a no-op when the prompt already contains <negative_constraints>", () => {
    const prompt = "Do the task.\n\n<negative_constraints>\n- DO NOT lie.\n</negative_constraints>";

    const result = injectGuardrails(prompt, ["- DO NOT stall."]);

    expect(result).toBe(prompt);
  });
});
