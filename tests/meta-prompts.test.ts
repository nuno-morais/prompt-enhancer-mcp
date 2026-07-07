import { describe, it, expect } from "vitest";
import { getMetaPromptConfig } from "../src/meta-prompts.js";
import type { TargetModel } from "../src/config.js";

describe("getMetaPromptConfig", () => {
  it("returns a config for 'generic' target model with brainstorm off", () => {
    const config = getMetaPromptConfig("generic", false);
    expect(config.systemPrompt).toContain("<user_draft>");
    expect(config.systemPrompt).toContain("STRICT RULES");
    expect(config.params.num_predict).toBe(384);
  });

  it("returns a config for 'claude' target model with XML-tag examples", () => {
    const config = getMetaPromptConfig("claude", false);
    expect(config.systemPrompt).toContain("<task>");
    expect(config.systemPrompt).toContain("<context>");
    expect(config.params.num_predict).toBe(512);
  });

  it("returns a config for 'gpt4o' target model with JSON-oriented examples", () => {
    const config = getMetaPromptConfig("gpt4o", false);
    expect(config.systemPrompt.toLowerCase()).toContain("json");
    expect(config.params.num_predict).toBe(768);
  });

  it("returns a config for 'gemini' target model with XML-tag examples", () => {
    const config = getMetaPromptConfig("gemini", false);
    expect(config.systemPrompt).toContain("<task>");
    expect(config.systemPrompt).toContain("<context>");
    expect(config.params.num_predict).toBe(512);
  });

  it("every target model forbids introductory filler phrases", () => {
    const targetModels: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];
    for (const targetModel of targetModels) {
      const config = getMetaPromptConfig(targetModel, false);
      expect(config.systemPrompt).toContain("Here is");
    }
  });

  it("appends persona instructions when brainstorm is true", () => {
    const targetModels: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];
    for (const targetModel of targetModels) {
      const config = getMetaPromptConfig(targetModel, true);
      expect(config.systemPrompt).toContain("persona");
    }
  });

  it("does not include persona instructions when brainstorm is false", () => {
    const targetModels: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];
    for (const targetModel of targetModels) {
      const config = getMetaPromptConfig(targetModel, false);
      expect(config.systemPrompt).not.toContain("persona");
    }
  });

  it("brainstorm addendum does not change the target model's num_predict", () => {
    const config = getMetaPromptConfig("gpt4o", true);
    expect(config.params.num_predict).toBe(768);
  });

  it("every target model includes the context-block handling rule", () => {
    const targetModels: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];
    for (const targetModel of targetModels) {
      const config = getMetaPromptConfig(targetModel, false);
      expect(config.systemPrompt).toContain("<background_context> is background information only");
    }
  });

  it("includes the no-invented-acronym-expansion rule for every target model", () => {
    for (const target of ["generic", "claude", "gpt4o", "gemini"] as const) {
      const { systemPrompt } = getMetaPromptConfig(target, false);
      expect(systemPrompt).toContain("Never expand or define acronyms");
    }
  });

  it("generic prompt contains a few-shot example preserving an unknown acronym", () => {
    const { systemPrompt } = getMetaPromptConfig("generic", false);
    expect(systemPrompt).toContain("KPX");
    // the example output must keep the acronym without a parenthesized expansion
    expect(systemPrompt).not.toMatch(/KPX\s*\(/);
  });
});
