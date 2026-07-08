import { lintOptimizedPrompt } from "./lint.js";
import { loadPreset } from "./preset.js";

export const LINT_PROMPT_TOOL = {
  name: "lint_prompt",
  description: "Checks any prompt for common issues (unresolved placeholders, suspect acronym expansions, leaked meta-commentary). No LLM call.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The prompt to lint" },
      draft: { type: "string", description: "Optional original draft; enables draft-comparison rules (e.g. acronym expansion checks)" },
      context: { type: "string", description: "Optional background context the prompt was built from" }
    },
    required: ["prompt"]
  }
};

const SKIPPED_NOTE = "_Note: draft not provided — draft-dependent rules (acronym expansion check) were skipped._";

export function handleLintPrompt(args: { prompt: unknown; draft?: string; context?: string }) {
  if (typeof args.prompt !== "string") {
    throw new Error("lint_prompt requires a string 'prompt' argument");
  }
  const glossary = loadPreset().glossary;
  const warnings = lintOptimizedPrompt(args.draft ?? "", args.context, args.prompt, undefined, glossary);
  const note = args.draft === undefined ? `\n\n${SKIPPED_NOTE}` : "";
  const text = warnings.length === 0
    ? `No lint issues found.${note}`
    : `⚠️ **Prompt lint warnings:**\n${warnings.map(w => `- ${w.message}`).join("\n")}${note}`;
  return { content: [{ type: "text" as const, text }] };
}
