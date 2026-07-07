import { describe, it, expect } from "vitest";
import { lintOptimizedPrompt } from "../src/lint.js";

describe("lintOptimizedPrompt — placeholders", () => {
  it("returns empty array for a clean prompt", () => {
    expect(lintOptimizedPrompt("summarize this", undefined, "Summarize the text in 3 sentences.")).toEqual([]);
  });

  it("flags unresolved {{placeholders}}", () => {
    const warnings = lintOptimizedPrompt(
      "summarize my doc",
      undefined,
      "<task>Summarize</task>\n<content>{{document_text}}</content>"
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("{{document_text}}");
    expect(warnings[0]).toContain("placeholder");
  });

  it("lists each distinct placeholder once", () => {
    const warnings = lintOptimizedPrompt(
      "draft",
      undefined,
      "{{a}} then {{b}} then {{a}} again"
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("{{a}}");
    expect(warnings[0]).toContain("{{b}}");
    // {{a}} appears once in the message
    expect(warnings[0].split("{{a}}")).toHaveLength(2);
  });
});

describe("lintOptimizedPrompt — acronym expansions", () => {
  it("flags an expansion of a draft acronym that appears nowhere in draft or context", () => {
    const warnings = lintOptimizedPrompt(
      "evaluate the usability of this MCP",
      undefined,
      "<task>Evaluate the MCP (Multi-Criteria Problem) usability.</task>"
    );
    expect(warnings.some(w => w.includes("Multi-Criteria Problem") && w.includes("MCP"))).toBe(true);
  });

  it("does not flag an expansion that the context supports", () => {
    const warnings = lintOptimizedPrompt(
      "evaluate this MCP",
      "MCP means Model Context Protocol server",
      "<task>Evaluate the MCP (Model Context Protocol) server.</task>"
    );
    expect(warnings).toEqual([]);
  });

  it("flags an expansion even when the draft's acronym is lowercase (the real-world MCP failure)", () => {
    const warnings = lintOptimizedPrompt(
      "I want to find the usability of this mcp and check what more other features should we include.",
      undefined,
      "<task>Evaluate the MCP (Multi-Criteria Problem) usability.</task>"
    );
    expect(warnings.some(w => w.includes("Multi-Criteria Problem") && w.includes("MCP"))).toBe(true);
  });

  it("does not flag an expansion present in the draft itself", () => {
    const warnings = lintOptimizedPrompt(
      "review this API (Application Programming Interface) spec",
      undefined,
      "Review the API (Application Programming Interface) specification."
    );
    expect(warnings).toEqual([]);
  });
});

describe("lintOptimizedPrompt — meta-commentary", () => {
  it("flags leaked critic phrases", () => {
    const warnings = lintOptimizedPrompt(
      "draft",
      undefined,
      "Here is the improved prompt:\nSummarize the text."
    );
    expect(warnings.some(w => w.toLowerCase().includes("meta-commentary"))).toBe(true);
  });

  it("does not flag prompts without leading commentary", () => {
    expect(lintOptimizedPrompt("draft", undefined, "Summarize the text.")).toEqual([]);
  });
});
