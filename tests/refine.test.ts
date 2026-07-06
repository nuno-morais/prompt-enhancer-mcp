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
      model: "test-model"
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
      model: "test-model"
    });

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const criticSystemMessage = secondCallBody.messages.find((m: { role: string }) => m.role === "system");

    expect(criticSystemMessage.content).toContain(LONG_DRAFT);
    expect(criticSystemMessage.content).toContain("First draft prompt");
    expect(criticSystemMessage.content).not.toContain("{{original_draft}}");
    expect(criticSystemMessage.content).not.toContain("{{first_draft_prompt}}");
  });

  it("wraps context in a <context> tag before <user_draft> in the first call when context is provided", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      context: "This is a project about widgets.",
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model"
    });

    const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = firstCallBody.messages.find((m: { role: string }) => m.role === "user");

    expect(userMessage.content).toBe(
      `<context>\nThis is a project about widgets.\n</context>\n<user_draft>\n${LONG_DRAFT}\n</user_draft>`
    );
  });

  it("omits the <context> tag entirely when context is not provided", async () => {
    const fetchMock = mockFirstAndSecondCalls("```text\nFirst draft prompt\n```", "```text\nFinal refined prompt\n```");
    vi.stubGlobal("fetch", fetchMock);

    await generateOptimizedPrompt({
      draft: LONG_DRAFT,
      target_model: "generic",
      brainstorm: false,
      explain: false,
      model: "test-model"
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
      model: "test-model"
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
      model: "test-model"
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
        model: "test-model"
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
      model: "test-model"
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
      model: "test-model"
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
      model: "test-model"
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
      model: "test-model"
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
      model: "test-model"
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
        model: "test-model"
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
        model: "test-model"
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
        model: "test-model"
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
        model: "test-model"
      },
      onProgress
    );

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3, "Generating initial draft...");
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3, "Reviewing draft with critic pass...");
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3, "Generating change summary...");
  });
});
