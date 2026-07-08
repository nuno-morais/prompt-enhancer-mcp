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
    expect(warnings[0].message).toContain("{{document_text}}");
    expect(warnings[0].message).toContain("placeholder");
  });

  it("lists each distinct placeholder once", () => {
    const warnings = lintOptimizedPrompt(
      "draft",
      undefined,
      "{{a}} then {{b}} then {{a}} again"
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("{{a}}");
    expect(warnings[0].message).toContain("{{b}}");
    // {{a}} appears once in the message
    expect(warnings[0].message.split("{{a}}")).toHaveLength(2);
  });
});

describe("lintOptimizedPrompt — acronym expansions", () => {
  it("flags an expansion of a draft acronym that appears nowhere in draft or context", () => {
    const warnings = lintOptimizedPrompt(
      "evaluate the usability of this MCP",
      undefined,
      "<task>Evaluate the MCP (Multi-Criteria Problem) usability.</task>"
    );
    expect(warnings.some(w => w.message.includes("Multi-Criteria Problem") && w.message.includes("MCP"))).toBe(true);
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
    expect(warnings.some(w => w.message.includes("Multi-Criteria Problem") && w.message.includes("MCP"))).toBe(true);
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
    expect(warnings.some(w => w.message.toLowerCase().includes("meta-commentary"))).toBe(true);
  });

  it("does not flag prompts without leading commentary", () => {
    expect(lintOptimizedPrompt("draft", undefined, "Summarize the text.")).toEqual([]);
  });
});

describe("expected artifact placeholder", () => {
  it("warns when the expected placeholder is missing from the output", () => {
    const warnings = lintOptimizedPrompt("draft", undefined, "A prompt without it.", "{{pipeline_config}}");
    expect(warnings.some(w => w.message.includes("{{pipeline_config}}") && w.message.includes("dropped"))).toBe(true);
  });

  it("does not flag the expected placeholder as unresolved when present", () => {
    const warnings = lintOptimizedPrompt("draft", undefined, "Provide {{pipeline_config}} please.", "{{pipeline_config}}");
    expect(warnings).toHaveLength(0);
  });

  it("still flags other placeholders as unresolved", () => {
    const warnings = lintOptimizedPrompt("draft", undefined, "Use {{pipeline_config}} and {{other}}.", "{{pipeline_config}}");
    expect(warnings.some(w => w.message.includes("{{other}}"))).toBe(true);
    expect(warnings.some(w => w.message.includes("Unresolved") && w.message.includes("{{pipeline_config}}"))).toBe(false);
  });
});

describe("lintOptimizedPrompt — structured warnings", () => {
  it("marks placeholder warnings as not repairable", () => {
    const w = lintOptimizedPrompt("summarize my doc", undefined, "Summarize {{document_text}}.");
    expect(w[0].kind).toBe("unresolved_placeholder");
    expect(w[0].repairable).toBe(false);
  });

  it("marks meta-commentary as repairable", () => {
    const w = lintOptimizedPrompt("do x", undefined, "Here is the prompt: Do X.");
    expect(w[0].kind).toBe("meta_commentary");
    expect(w[0].repairable).toBe(true);
  });

  it("marks suspect expansion repairable only when the glossary defines the acronym", () => {
    const prompt = "Review the MCP (Multi-Criteria Problem) usability.";
    const without = lintOptimizedPrompt("review my MCP", undefined, prompt);
    expect(without[0].kind).toBe("suspect_expansion");
    expect(without[0].repairable).toBe(false);

    const withGlossary = lintOptimizedPrompt("review my MCP", undefined, prompt, undefined, {
      MCP: "Model Context Protocol"
    });
    expect(withGlossary[0].repairable).toBe(true);
  });

  it("does not flag an expansion that matches the glossary", () => {
    const prompt = "Review the MCP (Model Context Protocol) server.";
    const w = lintOptimizedPrompt("review my MCP", undefined, prompt, undefined, {
      MCP: "Model Context Protocol"
    });
    expect(w).toEqual([]);
  });
});
