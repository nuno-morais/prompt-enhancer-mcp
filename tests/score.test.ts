import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../src/llm.js", () => ({ generateChat: vi.fn() }));
import { generateChat } from "../src/llm.js";
import { handleScorePrompt, parseJudgeResponse, computeOverall, verdict, DIMENSIONS } from "../src/score.js";

const goodSingle = '```json\n{"prompt": {"clarity": {"score": 4, "why": "clear"}, "specificity": {"score": 3, "why": "ok"}, "structure": {"score": 5, "why": "tagged"}, "guardrails": {"score": 2, "why": "none"}, "token_efficiency": {"score": 4, "why": "tight"}}}\n```';

describe("parseJudgeResponse", () => {
  it("parses a valid single-mode response", () => {
    const s = parseJudgeResponse(goodSingle, false);
    expect(s.prompt.clarity.score).toBe(4);
  });
  it("throws on missing dimension", () => {
    const bad = goodSingle.replace('"token_efficiency": {"score": 4, "why": "tight"}', '"nope": {"score": 4, "why": "x"}');
    expect(() => parseJudgeResponse(bad, false)).toThrow(/token_efficiency/);
  });
  it("throws on out-of-range score", () => {
    expect(() => parseJudgeResponse(goodSingle.replace('"score": 4, "why": "clear"', '"score": 7, "why": "clear"'), false)).toThrow(/1-5/);
  });
  it("throws on non-JSON garbage", () => {
    expect(() => parseJudgeResponse("```json\nnot json\n```", false)).toThrow();
  });
  it("requires a baseline object in comparison mode", () => {
    expect(() => parseJudgeResponse(goodSingle, true)).toThrow(/baseline/);
  });
});

describe("overall and verdict", () => {
  it("computes the arithmetic mean in code", () => {
    expect(computeOverall({ a: 4, b: 3, c: 5, d: 2, e: 4 })).toBe(3.6);
  });
  it("tie within 0.25, otherwise the higher side wins", () => {
    expect(verdict(3.6, 3.5)).toBe("tie");
    expect(verdict(3.9, 3.5)).toBe("prompt");
    expect(verdict(3.0, 3.5)).toBe("baseline");
  });
});

describe("handleScorePrompt", () => {
  beforeEach(() => vi.mocked(generateChat).mockReset());
  it("renders a markdown table with overall", async () => {
    vi.mocked(generateChat).mockResolvedValue({ message: { role: "assistant", content: goodSingle } });
    const res = await handleScorePrompt({ prompt: "Do the thing." });
    expect(res.content[0].text).toContain("| clarity | 4 |");
    expect(res.content[0].text).toContain("**Overall: 3.6 / 5**");
    expect(vi.mocked(generateChat)).toHaveBeenCalledTimes(1); // both prompts, one judge call in comparison too
  });
  it("throws a clear error on a malformed judge response", async () => {
    vi.mocked(generateChat).mockResolvedValue({ message: { role: "assistant", content: "```json\n{}\n```" } });
    await expect(handleScorePrompt({ prompt: "x" })).rejects.toThrow(/judge/i);
  });
  it("comparison mode renders deltas and a verdict", async () => {
    const cmp = goodSingle.replace("```json\n{", '```json\n{"baseline": {"clarity": {"score": 2, "why": "vague"}, "specificity": {"score": 2, "why": "vague"}, "structure": {"score": 2, "why": "flat"}, "guardrails": {"score": 1, "why": "none"}, "token_efficiency": {"score": 3, "why": "ok"}},');
    vi.mocked(generateChat).mockResolvedValue({ message: { role: "assistant", content: cmp } });
    const res = await handleScorePrompt({ prompt: "optimized", baseline: "rough draft" });
    expect(res.content[0].text).toContain("Verdict: **prompt**");
    expect(res.content[0].text).toContain("+2"); // clarity delta
  });
});
