import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { handleOptimizePrompt } from "../src/tool-handler.js";
import * as refineModule from "../src/refine.js";
import * as cacheModule from "../src/cache.js";
import * as presetModule from "../src/preset.js";
import { scanProject } from "../src/context-scanner.js";

vi.mock("../src/context-scanner.js");

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
      show_diff: false,
      session_id: undefined,
      auto_intent: true,
      auto_repair: true
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
      show_diff: false,
      session_id: undefined,
      auto_intent: true,
      auto_repair: true
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
      show_diff: false,
      session_id: undefined,
      auto_intent: true,
      auto_repair: true
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
      show_diff: false,
      session_id: undefined,
      context: "This is a project about widgets.",
      auto_intent: true,
      auto_repair: true,
      glossary: undefined
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

  it("appends a lint-warnings block when the result carries lintWarnings", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "<task>Sum</task>\n<content>{{text}}</content>",
      lintWarnings: [{
        message: "Unresolved placeholder(s) {{text}} — fill these in before using the prompt.",
        kind: "unresolved_placeholder",
        repairable: false
      }],
      repairedCount: 0
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

  it("appends auto context when auto_context is true", async () => {
    vi.mocked(scanProject).mockResolvedValue("Auto Context Details");
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});

    await handleOptimizePrompt({ draft: "test", auto_context: true, interactive: false });
    
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "Auto Context Details"
      })
    );
  });
  
  it("appends auto context to existing context when auto_context is true", async () => {
    vi.mocked(scanProject).mockResolvedValue("Auto Context Details");
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});

    await handleOptimizePrompt({ draft: "test", context: "Base Context", auto_context: true, interactive: false });
    
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "Base Context\n\nAuto Context Details"
      })
    );
  });

  it("ignores scanProject errors and proceeds with the base context", async () => {
    vi.mocked(scanProject).mockRejectedValue(new Error("Scan failed"));
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});

    await handleOptimizePrompt({ draft: "test", context: "Base Context", auto_context: true, interactive: false });
    
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "Base Context"
      })
    );
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

  it("appends a diff block when show_diff is true and a diff exists", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "final",
      diff: "- a\n+ b"
    });

    const result = await handleOptimizePrompt({
      draft: "diff block draft",
      show_diff: true,
      interactive: false
    });

    const diffBlock = result.content.find(b => b.text.includes("Critic pass diff"));
    expect(diffBlock).toBeDefined();
    expect(diffBlock!.text).toContain("- a\n+ b");
  });

  it("does not append a diff block when show_diff is false", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "final"
    });

    const result = await handleOptimizePrompt({ draft: "no diff draft", interactive: false });

    expect(result.content.find(b => b.text.includes("Critic pass diff"))).toBeUndefined();
  });

  it("passes the raw glossary map (not merged into context) to generateOptimizedPrompt", async () => {
    vi.spyOn(presetModule, "loadPreset").mockReturnValue({
      glossary: { MCP: "Model Context Protocol" }
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "hello world", interactive: false });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: undefined,
        glossary: { MCP: "Model Context Protocol" }
      })
    );
  });

  it("passes caller context unmerged alongside the glossary map when both are present", async () => {
    vi.spyOn(presetModule, "loadPreset").mockReturnValue({
      glossary: { MCP: "Model Context Protocol" }
    });
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({
      draft: "hello world",
      context: "This is a project about widgets.",
      interactive: false
    });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "This is a project about widgets.",
        glossary: { MCP: "Model Context Protocol" }
      })
    );
  });

  it("defaults auto_repair to true and forwards preset/explicit overrides", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    const generateSpy = vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "optimized text"
    });

    await handleOptimizePrompt({ draft: "hello world", interactive: false });
    expect(generateSpy.mock.calls[0][0].auto_repair).toBe(true);

    await handleOptimizePrompt({ draft: "hello world 2", interactive: false, auto_repair: false });
    expect(generateSpy.mock.calls[1][0].auto_repair).toBe(false);
  });

  it("renders an auto-repaired note before any remaining lint-warnings block", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "final text",
      repairedCount: 1,
      lintWarnings: []
    });

    const result = await handleOptimizePrompt({ draft: "hello world", interactive: false });

    expect(result.content.some(b => b.text.includes("1 issue(s) auto-repaired."))).toBe(true);
    expect(result.content.some(b => b.text.includes("Prompt lint warnings"))).toBe(false);
  });

  it("renders remaining lint warnings from the result when repairedCount is 0", async () => {
    vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
    vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
    vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
      optimizedPrompt: "final text",
      repairedCount: 0,
      lintWarnings: [{ message: "Unresolved placeholder {{doc}}", kind: "unresolved_placeholder", repairable: false }]
    });

    const result = await handleOptimizePrompt({ draft: "hello world", interactive: false });

    expect(result.content.some(b => b.text.includes("auto-repaired"))).toBe(false);
    const warnBlock = result.content.find(b => b.text.includes("Prompt lint warnings"));
    expect(warnBlock).toBeDefined();
    expect(warnBlock!.text).toContain("Unresolved placeholder {{doc}}");
  });

  describe("collapsed flags: auto and verbosity", () => {
    function spyGenerate() {
      vi.spyOn(cacheModule, "getCached").mockReturnValue(undefined);
      vi.spyOn(cacheModule, "setCached").mockImplementation(() => {});
      return vi.spyOn(refineModule, "generateOptimizedPrompt").mockResolvedValue({
        optimizedPrompt: "optimized text"
      });
    }

    it("auto: false disables all auto_* passes", async () => {
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", auto: false, interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        auto_cot: false,
        auto_guardrails: false,
        auto_intent: false,
        auto_repair: false
      }));
    });

    it("an individual auto_* arg overrides the auto switch", async () => {
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", auto: false, auto_cot: true, interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        auto_cot: true,
        auto_guardrails: false,
        auto_intent: false,
        auto_repair: false
      }));
    });

    it("verbosity: 'verbose' enables explain, stats and diff", async () => {
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", verbosity: "verbose", interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        explain: true,
        show_stats: true,
        show_diff: true
      }));
    });

    it("verbosity: 'explain' enables only the explanation", async () => {
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", verbosity: "explain", interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        explain: true,
        show_stats: false,
        show_diff: false
      }));
    });

    it("an individual display arg overrides verbosity", async () => {
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", verbosity: "verbose", show_diff: false, interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        explain: true,
        show_stats: true,
        show_diff: false
      }));
    });

    it("falls back to preset auto and verbosity when args don't specify them", async () => {
      vi.spyOn(presetModule, "loadPreset").mockReturnValue({ auto: false, verbosity: "explain" });
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        auto_cot: false,
        auto_guardrails: false,
        auto_intent: false,
        auto_repair: false,
        explain: true,
        show_stats: false,
        show_diff: false
      }));
    });

    it("individual preset flags override preset verbosity/auto", async () => {
      vi.spyOn(presetModule, "loadPreset").mockReturnValue({
        auto: false,
        auto_intent: true,
        verbosity: "verbose",
        show_diff: false
      });
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        auto_intent: true,
        auto_cot: false,
        explain: true,
        show_stats: true,
        show_diff: false
      }));
    });

    it("an explicit verbosity arg beats individual preset display flags", async () => {
      vi.spyOn(presetModule, "loadPreset").mockReturnValue({ explain: true, show_stats: true });
      const generateSpy = spyGenerate();

      await handleOptimizePrompt({ draft: "hello world", verbosity: "quiet", interactive: false });

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({
        explain: false,
        show_stats: false,
        show_diff: false
      }));
    });
  });
});
