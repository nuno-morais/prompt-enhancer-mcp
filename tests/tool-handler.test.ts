import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { handleOptimizePrompt } from "../src/tool-handler.js";
import * as refineModule from "../src/refine.js";
import * as cacheModule from "../src/cache.js";
import * as presetModule from "../src/preset.js";

describe("handleOptimizePrompt", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(presetModule, "loadPreset").mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when draft is not a string", async () => {
    await expect(handleOptimizePrompt({ draft: 123 })).rejects.toThrow(
      "optimize_prompt requires a string 'draft' argument"
    );
  });

  it("returns a cached result without calling generateOptimizedPrompt on a cache hit", async () => {
    const cachedValue = { content: [{ type: "text" as const, text: "cached prompt" }] };
    vi.spyOn(cacheModule, "getCached").mockReturnValue(cachedValue);
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt");

    const result = await handleOptimizePrompt({ draft: "hello world" });

    expect(result).toEqual(cachedValue);
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("calls generateOptimizedPrompt and stores the result in the cache on a cache miss", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    const setCachedSpy = vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    const result = await handleOptimizePrompt({ draft: "hello world", interactive: false });

    expect(result).toEqual({ content: [{ type: "text", text: "optimized text" }] });
    expect(setCachedSpy).toHaveBeenCalledWith(expect.any(String), result);
  });

  it("builds a 2-block content array when explain is true and an explanation is returned", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text",
      explanation: "Added a constraint."
    });

    const result = await handleOptimizePrompt({ draft: "hello world", explain: true, interactive: false });

    expect(result.content).toEqual([
      { type: "text", text: "optimized text" },
      { type: "text", text: "Added a constraint." }
    ]);
  });

  it("defaults target_model, brainstorm, explain, and model when neither args nor preset provide them", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "hello world" });

    expect(generateSpy).toHaveBeenCalledWith({
      draft: "hello world",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      interactive: true,
      engine: "ollama",
      model: "qcwind/qwen2.5-7B-instruct-Q4_K_M",
      auto_cot: true,
      auto_guardrails: true,
      show_stats: false,
      session_id: undefined,
      auto_intent: true
    });
  });

  it("falls back to preset values when args don't specify them", async () => {
    vi.spyOn(presetModule, "loadPreset").mockReturnValue({
      target_model: "claude",
      brainstorm: true,
      explain: true,
      model: "preset-model"
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "hello world" });

    expect(generateSpy).toHaveBeenCalledWith({
      draft: "hello world",
      target_model: "claude",
      brainstorm: true,
      explain: true,
      interactive: true,
      engine: "ollama",
      model: "preset-model",
      auto_cot: true,
      auto_guardrails: true,
      show_stats: false,
      session_id: undefined,
      auto_intent: true
    });
  });

  it("prefers explicit args over preset values when both are provided", async () => {
    vi.spyOn(presetModule, "loadPreset").mockReturnValue({
      target_model: "claude",
      brainstorm: true,
      explain: true,
      model: "preset-model"
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({
      draft: "hello world",
      target_model: "gpt4o",
      brainstorm: false,
      explain: false,
      interactive: false,
      model: "explicit-model"
    });

    expect(generateSpy).toHaveBeenCalledWith({
      draft: "hello world",
      target_model: "gpt4o",
      brainstorm: false,
      explain: false,
      interactive: false,
      engine: "ollama",
      model: "explicit-model",
      auto_cot: true,
      auto_guardrails: true,
      show_stats: false,
      session_id: undefined,
      auto_intent: true
    });
  });

  it("passes context through to generateOptimizedPrompt when provided", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "hello world", context: "This is a project about widgets." });

    expect(generateSpy).toHaveBeenCalledWith({
      draft: "hello world",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      interactive: true,
      engine: "ollama",
      model: "qcwind/qwen2.5-7B-instruct-Q4_K_M",
      auto_cot: true,
      auto_guardrails: true,
      show_stats: false,
      session_id: undefined,
      context: "This is a project about widgets.",
      auto_intent: true
    });
  });

  it("passes context as undefined when not provided", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "hello world" });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ context: undefined })
    );
  });

  it("sends well-formed progress notifications when a progress token is provided and the pipeline reports progress", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockImplementation(async (_params, onProgress) => {
      onProgress?.(1, 2, "Generating initial draft...");
      onProgress?.(2, 2, "Reviewing draft with critic pass...");
      return { optimizedPrompt: "optimized text" };
    });

    const sendNotification = vi.fn().mockResolvedValue(undefined);

    await handleOptimizePrompt(
      { draft: "hello world" },
      { token: "abc-123", sendNotification }
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenNthCalledWith(1, {
      method: "notifications/progress",
      params: { progressToken: "abc-123", progress: 1, total: 2, message: "Generating initial draft..." }
    });
    expect(sendNotification).toHaveBeenNthCalledWith(2, {
      method: "notifications/progress",
      params: { progressToken: "abc-123", progress: 2, total: 2, message: "Reviewing draft with critic pass..." }
    });
  });

  it("does not call sendNotification when no progress token is provided, but generateOptimizedPrompt still runs normally", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    const result = await handleOptimizePrompt({ draft: "hello world", interactive: false });

    expect(result).toEqual({ content: [{ type: "text", text: "optimized text" }] });
    expect(generateSpy).toHaveBeenCalled();
  });

  it("sends zero progress notifications on a cache hit even when a progress token is provided", async () => {
    const cachedValue = { content: [{ type: "text" as const, text: "cached prompt" }] };
    vi.spyOn(cacheModule, "getCached").mockReturnValue(cachedValue);
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt");
    const sendNotification = vi.fn().mockResolvedValue(undefined);

    const result = await handleOptimizePrompt(
      { draft: "hello world" },
      { token: "abc-123", sendNotification }
    );

    expect(result).toEqual(cachedValue);
    expect(generateSpy).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("appends a lint-warnings block when the optimized prompt has unresolved placeholders", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "<task>Sum</task>\n<content>{{text}}</content>"
    });

    const result = await handleOptimizePrompt({
      draft: "unique draft for lint test " + Date.now(),
      interactive: false
    });

    const lintBlock = result.content.find(b => b.text.includes("Prompt lint warnings"));
    expect(lintBlock).toBeDefined();
    expect(lintBlock!.text).toContain("{{text}}");
  });

  it("adds no lint block for a clean prompt", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "Summarize the text in 3 sentences."
    });

    const result = await handleOptimizePrompt({
      draft: "another unique draft " + Date.now(),
      interactive: false
    });

    expect(result.content.some(b => b.text.includes("Prompt lint warnings"))).toBe(false);
  });

  it("does not serve a cached result when session_id is provided", async () => {
    const draft = "session cache bypass draft " + Date.now();
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt");
    generateSpy.mockResolvedValueOnce({ optimizedPrompt: "v1" });
    generateSpy.mockResolvedValueOnce({ optimizedPrompt: "v2" });

    const first = await handleOptimizePrompt({ draft, session_id: "s-1", interactive: false });
    const second = await handleOptimizePrompt({ draft, session_id: "s-1", interactive: false });

    expect(first.content[0].text).toBe("v1");
    expect(second.content[0].text).toBe("v2"); // would be "v1" if cached
  });
});

describe("auto_intent parameter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(presetModule, "loadPreset").mockReturnValue({});
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults auto_intent to true and passes brainstorm as undefined when unset", async () => {
    const spy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "some draft" });

    const passed = spy.mock.calls[0][0];
    expect(passed.auto_intent).toBe(true);
    expect(passed.brainstorm).toBeUndefined();
  });

  it("passes explicit brainstorm through unchanged", async () => {
    const spy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "some draft", brainstorm: false });

    expect(spy.mock.calls[0][0].brainstorm).toBe(false);
  });

  it("forwards auto_intent: false", async () => {
    const spy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "some draft", auto_intent: false });

    expect(spy.mock.calls[0][0].auto_intent).toBe(false);
  });
});
