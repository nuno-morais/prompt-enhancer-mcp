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
