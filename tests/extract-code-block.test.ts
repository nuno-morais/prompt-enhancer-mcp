import { describe, it, expect } from "vitest";
import { extractCodeBlock } from "../src/extract-code-block.js";

describe("extractCodeBlock", () => {
  it("extracts content from a fenced code block with a language tag", () => {
    const input = "```text\nOptimized prompt content\n```";
    expect(extractCodeBlock(input)).toBe("Optimized prompt content");
  });

  it("extracts content from a fenced code block with no language tag", () => {
    const input = "```\nOptimized prompt content\n```";
    expect(extractCodeBlock(input)).toBe("Optimized prompt content");
  });

  it("ignores leading/trailing text outside the code block", () => {
    const input = "Here is:\n```text\nOptimized prompt content\n```\nI hope this helps!";
    expect(extractCodeBlock(input)).toBe("Optimized prompt content");
  });

  it("preserves multi-line content and internal formatting", () => {
    const input = "```text\nLine one\nLine two\n\nLine four\n```";
    expect(extractCodeBlock(input)).toBe("Line one\nLine two\n\nLine four");
  });

  it("falls back to the trimmed full text when no code block is found", () => {
    const input = "  No code block here, just plain text.  ";
    expect(extractCodeBlock(input)).toBe("No code block here, just plain text.");
  });

  it("strips an opening fence with no closing fence (Ollama stop-sequence case)", () => {
    const input = "```text\nOptimized prompt content";
    expect(extractCodeBlock(input)).toBe("Optimized prompt content");
  });
});
