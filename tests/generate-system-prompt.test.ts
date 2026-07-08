import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../src/llm.js", () => ({ generateChat: vi.fn() }));
import { generateChat } from "../src/llm.js";
import { handleGenerateSystemPrompt, GENERATE_SYSTEM_PROMPT_TOOL } from "../src/generate-system-prompt.js";

const genResponse = (text: string) => ({ message: { role: "assistant" as const, content: `\`\`\`text\n${text}\n\`\`\`` } });

const singleScore = '```json\n{"prompt": {"clarity": {"score": 4, "why": "clear"}, "specificity": {"score": 3, "why": "ok"}, "structure": {"score": 5, "why": "tagged"}, "guardrails": {"score": 2, "why": "none"}, "token_efficiency": {"score": 4, "why": "tight"}}}\n```';
const compareScore = '```json\n{"baseline": {"clarity": {"score": 2, "why": "vague"}, "specificity": {"score": 2, "why": "vague"}, "structure": {"score": 2, "why": "flat"}, "guardrails": {"score": 1, "why": "none"}, "token_efficiency": {"score": 3, "why": "ok"}}, "prompt": {"clarity": {"score": 4, "why": "clear"}, "specificity": {"score": 3, "why": "ok"}, "structure": {"score": 5, "why": "tagged"}, "guardrails": {"score": 4, "why": "explicit"}, "token_efficiency": {"score": 4, "why": "tight"}}}\n```';

describe("generate_system_prompt tool", () => {
  beforeEach(() => vi.mocked(generateChat).mockReset());

  it("declares only role as required", () => {
    expect((GENERATE_SYSTEM_PROMPT_TOOL.inputSchema as any).required).toEqual(["role"]);
  });

  it("throws on a non-string role", async () => {
    await expect(handleGenerateSystemPrompt({ role: 42 })).rejects.toThrow("string 'role'");
  });

  it("single rigor: generates, lints, and scores the prompt", async () => {
    vi.mocked(generateChat)
      .mockResolvedValueOnce(genResponse("You are a senior code reviewer.\n\nOutput format: markdown."))
      .mockResolvedValueOnce({ message: { role: "assistant", content: singleScore } });

    const res = await handleGenerateSystemPrompt({ role: "senior code reviewer" });

    expect(res.content[0].text).toContain("senior code reviewer");
    expect(res.content[1].text).toBe("No lint issues found.");
    expect(res.content[2].text).toContain("**Overall: 3.6 / 5**");
    expect(vi.mocked(generateChat)).toHaveBeenCalledTimes(2);
  });

  it("surfaces lint warnings when the generated prompt has issues", async () => {
    vi.mocked(generateChat)
      .mockResolvedValueOnce(genResponse("You are a {{role}} reviewer."))
      .mockResolvedValueOnce({ message: { role: "assistant", content: singleScore } });

    const res = await handleGenerateSystemPrompt({ role: "reviewer" });
    expect(res.content[1].text).toContain("⚠️ **Prompt lint warnings:**");
  });

  it("rigor 'both': generates two variants and returns a judged comparison", async () => {
    vi.mocked(generateChat)
      .mockResolvedValueOnce(genResponse("Terse role prompt."))
      .mockResolvedValueOnce(genResponse("Guardrailed role prompt with constraints."))
      .mockResolvedValueOnce({ message: { role: "assistant", content: compareScore } });

    const res = await handleGenerateSystemPrompt({ role: "senior code reviewer", rigor: "both" });

    expect(res.content[0].text).toContain("Terse variant");
    expect(res.content[1].text).toContain("Guardrailed variant");
    expect(res.content[3].text).toContain("Verdict: **prompt**");
    expect(vi.mocked(generateChat)).toHaveBeenCalledTimes(3);
  });

  it("applies xml format conversion", async () => {
    vi.mocked(generateChat)
      .mockResolvedValueOnce(genResponse("Role:\nreviewer\nOutput format:\nmarkdown"))
      .mockResolvedValueOnce({ message: { role: "assistant", content: singleScore } });

    const res = await handleGenerateSystemPrompt({ role: "reviewer", format: "xml" });
    expect(res.content[0].text).toContain("<role>");
  });
});
