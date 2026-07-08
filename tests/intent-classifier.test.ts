import { describe, it, expect, vi, afterEach } from "vitest";
import {
  classifyIntent,
  buildIntentLine,
  injectIntentLine
} from "../src/intent-classifier.js";
import * as llm from "../src/llm.js";

describe("classifyIntent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["WEB_SEARCH", "web_search"],
    ["BRAINSTORM", "brainstorm"],
    ["SELF_CONTAINED", "self_contained"]
  ])("maps classifier answer %s to intent %s", async (answer, intent) => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: answer }
    });
    const result = await classifyIntent("draft", undefined, "model", "ollama", {});
    expect(result.intent).toBe(intent);
    expect(result.artifactName).toBeUndefined();
  });

  it("parses USER_ARTIFACT with an artifact name", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "USER_ARTIFACT pipeline_config" }
    });
    const result = await classifyIntent("check my pipeline", undefined, "model", "ollama", {});
    expect(result).toEqual({ intent: "user_artifact", artifactName: "pipeline_config" });
  });

  it("defaults artifactName when USER_ARTIFACT has no name", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "USER_ARTIFACT" }
    });
    const result = await classifyIntent("check this", undefined, "model", "ollama", {});
    expect(result).toEqual({ intent: "user_artifact", artifactName: "artifact" });
  });

  it("is case/whitespace tolerant", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "  web_search\n" }
    });
    const result = await classifyIntent("latest news on X", undefined, "model", "ollama", {});
    expect(result.intent).toBe("web_search");
  });

  it("returns self_contained on malformed output", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "I think this needs a web search because..." }
    });
    const result = await classifyIntent("draft", undefined, "model", "ollama", {});
    expect(result.intent).toBe("self_contained");
    expect(result.fallback).toBe("unrecognized_response");
  });

  it("returns self_contained and does not throw when the LLM call rejects", async () => {
    vi.spyOn(llm, "generateChat").mockRejectedValue(new Error("network error"));
    const result = await classifyIntent("draft", undefined, "model", "ollama", {});
    expect(result.intent).toBe("self_contained");
    expect(result.fallback).toBe("classifier_error");
  });

  it("does not set fallback on a clean classification", async () => {
    vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "SELF_CONTAINED" }
    });
    const result = await classifyIntent("draft", undefined, "model", "ollama", {});
    expect(result.fallback).toBeUndefined();
  });

  it("includes context in the user message when provided", async () => {
    const spy = vi.spyOn(llm, "generateChat").mockResolvedValue({
      message: { role: "assistant", content: "SELF_CONTAINED" }
    });
    await classifyIntent("draft", "KPX means our data pipeline", "model", "ollama", {});
    const userMessage = spy.mock.calls[0][0].messages.find(m => m.role === "user")!;
    expect(userMessage.content).toContain("KPX means our data pipeline");
    expect(userMessage.content).toContain("draft");
  });
});

describe("buildIntentLine", () => {
  it("returns the web-search line for web_search", () => {
    expect(buildIntentLine({ intent: "web_search" })).toBe(
      "Use up-to-date information; search the web before answering."
    );
  });

  it("returns a placeholder ask for user_artifact", () => {
    expect(buildIntentLine({ intent: "user_artifact", artifactName: "pipeline_config" })).toBe(
      "Ask the user to provide {{pipeline_config}} before proceeding."
    );
  });

  it("returns null for brainstorm and self_contained", () => {
    expect(buildIntentLine({ intent: "brainstorm" })).toBeNull();
    expect(buildIntentLine({ intent: "self_contained" })).toBeNull();
  });
});

describe("injectIntentLine", () => {
  const line = "Use up-to-date information; search the web before answering.";

  it("wraps the line in <required_capabilities> for claude", () => {
    const result = injectIntentLine("Prompt.", line, "claude");
    expect(result).toBe(`Prompt.\n\n<required_capabilities>\n${line}\n</required_capabilities>`);
  });

  it("wraps the line in <required_capabilities> for gemini", () => {
    const result = injectIntentLine("Prompt.", line, "gemini");
    expect(result).toContain("<required_capabilities>");
  });

  it("appends a plain line for generic and gpt4o", () => {
    expect(injectIntentLine("Prompt.", line, "generic")).toBe(`Prompt.\n\n${line}`);
    expect(injectIntentLine("Prompt.", line, "gpt4o")).toBe(`Prompt.\n\n${line}`);
  });

  it("skips injection if the prompt already has a <required_capabilities> tag", () => {
    const prompt = "Prompt.\n<required_capabilities>x</required_capabilities>";
    expect(injectIntentLine(prompt, line, "claude")).toBe(prompt);
  });
});
