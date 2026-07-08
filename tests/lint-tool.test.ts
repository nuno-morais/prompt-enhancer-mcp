import { describe, it, expect } from "vitest";
import { handleLintPrompt, LINT_PROMPT_TOOL } from "../src/lint-tool.js";

describe("lint_prompt tool", () => {
  it("declares only prompt as required", () => {
    expect((LINT_PROMPT_TOOL.inputSchema as any).required).toEqual(["prompt"]);
  });

  it("throws on a non-string prompt", () => {
    expect(() => handleLintPrompt({ prompt: 42 })).toThrow("string 'prompt'");
  });

  it("reports a clean prompt", () => {
    const res = handleLintPrompt({ prompt: "Summarize the text in 3 sentences.", draft: "summarize" });
    expect(res.content[0].text).toBe("No lint issues found.");
  });

  it("returns warnings in the standard format", () => {
    const res = handleLintPrompt({ prompt: "Summarize {{doc}}.", draft: "summarize my doc" });
    expect(res.content[0].text).toContain("⚠️ **Prompt lint warnings:**");
    expect(res.content[0].text).toContain("{{doc}}");
  });

  it("notes skipped draft-dependent rules when draft is absent", () => {
    const res = handleLintPrompt({ prompt: "Review the MCP (Multi-Criteria Problem)." });
    expect(res.content[0].text).toContain("draft not provided");
  });
});
