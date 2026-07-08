import { describe, it, expect, vi, afterEach } from "vitest";
import { generateOptimizedPrompt } from "../src/refine.js";

const LONG_DRAFT = "I want a detailed and comprehensive summary of this long article covering many different topics in depth";

function mockFirstAndSecondCalls(firstContent: string, secondContent: string) {
  return vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: firstContent } })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: secondContent } })
    });
}

describe("generateOptimizedPrompt", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes exactly 2 calls to Ollama and returns the second call's extracted content as optimizedPrompt", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.optimizedPrompt).toBe("Final refined prompt");
    expect(result.explanation).toBeUndefined();
  });

  it("sends the original draft and the first draft substituted into the critic system prompt, with no leftover placeholders", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const criticSystemMessage = secondCallBody.messages.find((m: { role: string }) => m.role === "system");

    expect(criticSystemMessage.content).toContain(LONG_DRAFT);
    expect(criticSystemMessage.content).toContain("First draft prompt");
    expect(criticSystemMessage.content).not.toContain("{{original_draft}}");
    expect(criticSystemMessage.content).not.toContain("{{first_draft_prompt}}");
  });

  it("wraps context in a <background_context> tag before <user_draft> in the first call when context is provided", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      context: "This is a project about widgets.",
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = firstCallBody.messages.find((m: { role: string }) => m.role === "user");

    expect(userMessage.content).toBe(
      `<background_context>\nThis is a project about widgets.\n</background_context>\n<user_draft>\n${LONG_DRAFT}\n</user_draft>`
    );
  });

  it("omits the <background_context> tag entirely when context is not provided", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = firstCallBody.messages.find((m: { role: string }) => m.role === "user");

    expect(userMessage.content).toBe(`<user_draft>\n${LONG_DRAFT}\n</user_draft>`);
  });

  it("substitutes a draft containing a literal $ replacement-pattern sequence without corruption", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    const draftWithDollarPattern = "I need a detailed prompt about pricing, where the price is $& and $1 total for the complete comprehensive package deal";

    await generateOptimizedPrompt({
      draft: draftWithDollarPattern,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const criticSystemMessage = secondCallBody.messages.find((m: { role: string }) => m.role === "system");

    expect(criticSystemMessage.content).toContain(draftWithDollarPattern);
  });

  it("sends both a system and a user message on the second (critic) call", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const roles = secondCallBody.messages.map((m: { role: string }) => m.role);

    expect(roles).toContain("system");
    expect(roles).toContain("user");
  });

  it("propagates an error from the first call without attempting a second call", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error"
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateOptimizedPrompt({
        draft: LONG_DRAFT,
        target_model: "generic",
        brainstorm: false,
        explain: false,
        model: "test-model",
        auto_intent: false
      })
    ).rejects.toThrow("Ollama request failed: 500 Internal Server Error");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips the critic call for a trivial draft (generic target model, no brainstorm, <= 15 words) and returns the first draft directly", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nSummarize this text\n```" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: "summarize this",
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.optimizedPrompt).toBe("Summarize this text");
    expect(result.explanation).toBeUndefined();
  });

  it("returns the fixed skip explanation and makes no 3rd call when skip-critic and explain are both triggered", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nSummarize this text\n```" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: "summarize this",
      target_model: "generic",
      brainstorm: false,
      explain: true,
      model: "test-model",
      auto_intent: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.optimizedPrompt).toBe("Summarize this text");
    expect(result.explanation).toBe("No critic pass (trivial draft).");
  });

  it("does not skip the critic call for a short draft when target model is not generic", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: "summarize this",
      target_model: "claude",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.optimizedPrompt).toBe("Final refined prompt");
  });

  it("does not skip the critic call for a short draft when brainstorm is true", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: "summarize this",
      target_model: "generic",
      brainstorm: true,
      explain: false,
      model: "test-model",
      auto_intent: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.optimizedPrompt).toBe("Final refined prompt");
  });

  it("makes a 3rd call for the explanation when explain is true and the critic ran, and trims the response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nFirst draft prompt\n```" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nFinal refined prompt\n```" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "  Added missing output format constraint.  " } })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: true,
      model: "test-model",
      auto_intent: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.optimizedPrompt).toBe("Final refined prompt");
    expect(result.explanation).toBe("Added missing output format constraint.");

    const thirdCallBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    const explainSystemMessage = thirdCallBody.messages.find((m: { role: string }) => m.role === "system");
    expect(explainSystemMessage.content).toContain("First draft prompt");
    expect(explainSystemMessage.content).toContain("Final refined prompt");
  });

  it("sends no progress notifications for a trivial draft with explain false (total: 0)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nSummarize this text\n```" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();

    await generateOptimizedPrompt(
      {
        draft: "summarize this",
        target_model: "generic",
        brainstorm: false,
        explain: false,
        model: "test-model",
        auto_intent: false
      },
      onProgress
    );

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("sends exactly one progress notification for a trivial draft with explain true (total: 1)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nSummarize this text\n```" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();

    await generateOptimizedPrompt(
      {
        draft: "summarize this",
        target_model: "generic",
        brainstorm: false,
        explain: true,
        model: "test-model",
        auto_intent: false
      },
      onProgress
    );

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 1, "Generating initial draft...");
  });

  it("sends exactly two progress notifications for a non-trivial draft with explain false (total: 2)", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();

    await generateOptimizedPrompt(
      {
        draft: LONG_DRAFT,
        target_model: "generic",
        brainstorm: false,
        explain: false,
        model: "test-model",
        auto_intent: false
      },
      onProgress
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2, "Generating initial draft...");
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2, "Reviewing draft with critic pass...");
  });

  it("sends exactly three progress notifications for a non-trivial draft with explain true (total: 3)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nFirst draft prompt\n```" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nFinal refined prompt\n```" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "Added a constraint." } })
      });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();

    await generateOptimizedPrompt(
      {
        draft: LONG_DRAFT,
        target_model: "generic",
        brainstorm: false,
        explain: true,
        model: "test-model",
        auto_intent: false
      },
      onProgress
    );

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3, "Generating initial draft...");
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3, "Reviewing draft with critic pass...");
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3, "Generating change summary...");
  });
});

describe("auto-repair", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const REPAIR_DRAFT = "please review the MCP server usability and quality in detail across many many different dimensions today";

  function mockThreeCalls(first: string, second: string, third: string | Error) {
    const fn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: first } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: second } })
      });
    if (third instanceof Error) {
      fn.mockRejectedValueOnce(third);
    } else {
      fn.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: third } })
      });
    }
    return fn;
  }

  it("runs one repair call when a repairable warning exists and returns the fixed prompt", async () => {
    const fetchMock = mockThreeCalls(
      "```text\nFirst draft prompt\n```",
      "```text\nReview the MCP (Multi-Criteria Problem) server.\n```",
      "```text\nReview the MCP (Model Context Protocol) server.\n```"
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: REPAIR_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      glossary: { MCP: "Model Context Protocol" },
      auto_repair: true
    });

    expect(result.optimizedPrompt).toContain("Model Context Protocol");
    expect(result.repairedCount).toBe(1);
    expect(result.lintWarnings).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports repairedCount 0 when the repair call fails to actually fix the issue", async () => {
    const fetchMock = mockThreeCalls(
      "```text\nFirst draft prompt\n```",
      "```text\nReview the MCP (Multi-Criteria Problem) server.\n```",
      "```text\nReview the MCP (Multi-Criteria Problem) server.\n```"
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: REPAIR_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      glossary: { MCP: "Model Context Protocol" },
      auto_repair: true
    });

    expect(result.repairedCount).toBe(0);
    expect(result.lintWarnings?.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not repair unrepairable warnings and surfaces them", async () => {
    const fetchMock = mockFirstAndSecondCalls(
      "```text\nFirst draft prompt\n```",
      "```text\nReview the {{doc}} carefully.\n```"
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: REPAIR_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      auto_repair: true
    });

    expect(result.repairedCount).toBe(0);
    expect(result.lintWarnings?.map(w => w.kind)).toContain("unresolved_placeholder");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the pre-repair prompt when the repair call throws", async () => {
    const fetchMock = mockThreeCalls(
      "```text\nFirst draft prompt\n```",
      "```text\nReview the MCP (Multi-Criteria Problem) server.\n```",
      new Error("network down")
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: REPAIR_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      glossary: { MCP: "Model Context Protocol" },
      auto_repair: true
    });

    expect(result.optimizedPrompt).toContain("Multi-Criteria Problem");
    expect(result.lintWarnings?.length).toBe(1);
  });

  it("skips repair entirely when auto_repair is false", async () => {
    const fetchMock = mockFirstAndSecondCalls(
      "```text\nFirst draft prompt\n```",
      "```text\nReview the MCP (Multi-Criteria Problem) server.\n```"
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: REPAIR_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      glossary: { MCP: "Model Context Protocol" },
      auto_repair: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.lintWarnings?.length).toBe(1);
  });

  it("session-feedback branch lints without repairing", async () => {
    const sessionId = `repair-session-${Date.now()}`;
    const fetchMock = mockFirstAndSecondCalls(
      "```text\nFirst draft prompt\n```",
      "```text\nReview the MCP (Multi-Criteria Problem) server.\n```"
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: REPAIR_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      session_id: sessionId,
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      glossary: { MCP: "Model Context Protocol" },
      auto_repair: false
    });

    const feedbackFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nReview the MCP (Multi-Criteria Problem) server, revised.\n```" } })
    });
    vi.stubGlobal("fetch", feedbackFetchMock);

    const result = await generateOptimizedPrompt({
      draft: "make the MCP mention more precise",
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model",
      session_id: sessionId,
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      glossary: { MCP: "Model Context Protocol" },
      auto_repair: true
    });

    expect(feedbackFetchMock).toHaveBeenCalledTimes(1); // no repair call fired
    expect(result.repairedCount).toBe(0);
    expect(result.lintWarnings?.length).toBe(1);
  });
});

describe("intent classification integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Mocks fetch so the intent classifier call (system prompt contains
  // "Classify the user's task draft") answers `intentAnswer`, and every
  // other call returns a generic code block.
  function mockLLM(intentAnswer: string) {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const system = body.messages.find((m: { role: string }) => m.role === "system")?.content ?? "";
      if (system.includes("Classify the user's task draft")) {
        return {
          ok: true,
          json: () => Promise.resolve({ message: { role: "assistant", content: intentAnswer } })
        };
      }
      return {
        ok: true,
        json: () => Promise.resolve({ message: { role: "assistant", content: "```text\nOptimized prompt body.\n```" } })
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("auto-enables brainstorm mode when brainstorm is unset and intent is BRAINSTORM", async () => {
    const fetchMock = mockLLM("BRAINSTORM");
    const result = await generateOptimizedPrompt({
      draft: "ideas for naming a coffee shop with a long enough draft to trigger the critic pass",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });

    const mainCall = fetchMock.mock.calls.find((c: [string, { body: string }]) => {
      const body = JSON.parse(c[1].body);
      return body.messages.some((m: { role: string; content: string }) => m.role === "system" && m.content.includes("BRAINSTORMING TASKS"));
    });
    expect(mainCall).toBeDefined();
    expect(result.intentResult?.intent).toBe("brainstorm");
  });

  it("does NOT enable brainstorm when the caller explicitly passed brainstorm: false", async () => {
    const fetchMock = mockLLM("BRAINSTORM");
    await generateOptimizedPrompt({
      draft: "ideas for naming a coffee shop with a long enough draft to trigger the critic pass",
      target_model: "generic",
      brainstorm: false,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });

    const brainstormCall = fetchMock.mock.calls.find((c: [string, { body: string }]) => {
      const body = JSON.parse(c[1].body);
      return body.messages.some((m: { role: string; content: string }) => m.role === "system" && m.content.includes("BRAINSTORMING TASKS"));
    });
    expect(brainstormCall).toBeUndefined();
  });

  it("injects the web-search line when intent is WEB_SEARCH", async () => {
    mockLLM("WEB_SEARCH");
    const result = await generateOptimizedPrompt({
      draft: "what are the latest breaking changes in the newest React release this year",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });

    expect(result.optimizedPrompt).toContain(
      "Use up-to-date information; search the web before answering."
    );
    expect(result.intentResult?.intent).toBe("web_search");
  });

  it("surfaces the fallback reason in the explanation when classification is unrecognized", async () => {
    mockLLM("I'm not sure, maybe self contained?");
    const result = await generateOptimizedPrompt({
      draft: "short trivial draft",
      target_model: "generic",
      brainstorm: undefined,
      explain: true,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });

    expect(result.intentResult?.fallback).toBe("unrecognized_response");
    expect(result.explanation).toContain("fell back to self_contained");
    expect(result.explanation).toContain("unrecognized response");
  });

  it("performs no classification call when auto_intent is false", async () => {
    const fetchMock = mockLLM("WEB_SEARCH");
    const result = await generateOptimizedPrompt({
      draft: "short trivial draft",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false
    });

    const classifierCalls = fetchMock.mock.calls.filter((c: [string, { body: string }]) => {
      const body = JSON.parse(c[1].body);
      return body.messages.some((m: { role: string; content: string }) => m.role === "system" && m.content.includes("Classify the user's task draft"));
    });
    expect(classifierCalls).toHaveLength(0);
    expect(result.intentResult).toBeUndefined();
    expect(result.optimizedPrompt).not.toContain("search the web");
  });

  it("performs no classification call on session refinement calls", async () => {
    const fetchMock = mockLLM("WEB_SEARCH");
    const sessionId = `intent-test-${Date.now()}`;
    // First call establishes the session (classification allowed here)
    await generateOptimizedPrompt({
      draft: "first draft long enough to run through the full standard pipeline today",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      engine: "ollama",
      model: "test-model",
      session_id: sessionId,
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });
    const callsAfterFirst = fetchMock.mock.calls.length;
    // Second call refines within the session — must not classify
    await generateOptimizedPrompt({
      draft: "make it shorter",
      target_model: "generic",
      brainstorm: undefined,
      explain: false,
      engine: "ollama",
      model: "test-model",
      session_id: sessionId,
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });
    const classifierCallsInRefinement = fetchMock.mock.calls.slice(callsAfterFirst).filter((c: [string, { body: string }]) => {
      const body = JSON.parse(c[1].body);
      return body.messages.some((m: { role: string; content: string }) => m.role === "system" && m.content.includes("Classify the user's task draft"));
    });
    expect(classifierCallsInRefinement).toHaveLength(0);
  });

  it("mentions auto-enabled brainstorm in the explanation when explain is true", async () => {
    mockLLM("BRAINSTORM");
    const result = await generateOptimizedPrompt({
      draft: "ideas for naming a coffee shop with a long enough draft to trigger the critic pass",
      target_model: "generic",
      brainstorm: undefined,
      explain: true,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: true
    });
    expect(result.explanation).toContain("brainstorm");
  });

  it("returns a line diff between first draft and final prompt when show_diff is true", async () => {
    const fetchMock = mockFirstAndSecondCalls(
      "```text\n<task>Do X</task>\n```",
      "```text\n<task>Do X precisely</task>\n```"
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "claude",
      brainstorm: false,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      show_diff: true
    });

    expect(result.diff).toBe("- <task>Do X</task>\n+ <task>Do X precisely</task>");
  });

  it("returns no diff when show_diff is false", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\na\n```", "```text\nb\n```");
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "claude",
      brainstorm: false,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false
    });

    expect(result.diff).toBeUndefined();
  });

  it("reports no diff available for trivial drafts when show_diff is true", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nshort answer\n```", "```text\nunused\n```");
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOptimizedPrompt({
      draft: "short trivial draft",
      target_model: "generic",
      brainstorm: false,
      explain: false,
      engine: "ollama",
      model: "test-model",
      auto_cot: false,
      auto_guardrails: false,
      auto_intent: false,
      show_diff: true
    });

    expect(result.diff).toBe("(critic pass skipped — no diff available)");
  });
});
