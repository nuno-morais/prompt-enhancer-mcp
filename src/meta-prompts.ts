import { getOllamaParams, type TargetModel } from "./config.js";
import { loadPromptTemplate } from "./prompt-templates.js";

export type { TargetModel };

// Prompt text lives in <package root>/prompts/*.txt; this module only
// composes it. Edit the .txt files to tune prompts — no code changes needed.

const OPTIMIZE_TEMPLATES: Record<TargetModel, string> = {
  generic: "optimize-generic",
  claude: "optimize-claude",
  gpt4o: "optimize-gpt4o",
  gemini: "optimize-gemini"
};

export function getMetaPromptConfig(targetModel: TargetModel, brainstorm: boolean): {
  systemPrompt: string;
  params: ReturnType<typeof getOllamaParams>;
} {
  const basePrompt = loadPromptTemplate(OPTIMIZE_TEMPLATES[targetModel])
    .split("{{rules_header}}").join(loadPromptTemplate("rules-header"));

  const systemPrompt = brainstorm
    ? `${basePrompt}\n${loadPromptTemplate("brainstorm-addendum")}`
    : basePrompt;

  return { systemPrompt, params: getOllamaParams(targetModel) };
}

export function getGenerateSystemPromptMeta(rigor: "terse" | "guardrailed", role: string, failureModes: string, transcript: string): string {
  const template = loadPromptTemplate(rigor === "terse" ? "generate-system-terse" : "generate-system-guardrailed");
  return template
    .split("{{role}}").join(role)
    .split("{{failure_modes}}").join(failureModes || "(none provided)")
    .split("{{transcript}}").join(transcript || "(none provided)");
}

export const SCORE_SYSTEM_PROMPT = loadPromptTemplate("score");

export const COMPARE_SYSTEM_PROMPT = loadPromptTemplate("compare");
