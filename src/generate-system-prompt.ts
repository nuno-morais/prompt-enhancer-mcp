import { generateChat, type LLMEngine } from "./llm.js";
import { extractCodeBlock } from "./extract-code-block.js";
import { loadPreset } from "./preset.js";
import { DEFAULT_MODEL, DEFAULT_ENGINE } from "./config.js";
import { getGenerateSystemPromptMeta, SCORE_SYSTEM_PROMPT, COMPARE_SYSTEM_PROMPT } from "./meta-prompts.js";
import { parseJudgeResponse, renderSingle, renderComparison } from "./score.js";
import { lintOptimizedPrompt, type LintWarning } from "./lint.js";
import { convertFormat, type PromptFormat } from "./format-convert.js";

export const GENERATE_SYSTEM_PROMPT_TOOL = {
  name: "generate_system_prompt",
  description: "Drafts a system prompt for a given role, then auto-lints and auto-scores it before returning. Pass rigor: 'both' to generate a terse and a guardrailed variant and get a judged comparison.",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string", description: "The agent's role/task, e.g. 'senior code reviewer'" },
      failure_modes: {
        type: "array",
        items: { type: "string" },
        description: "Optional known failure modes to guard against (e.g. 'hallucinates file paths', 'too verbose')"
      },
      transcript: { type: "string", description: "Optional failed-conversation excerpt to diagnose from instead of a cold role" },
      rigor: {
        type: "string",
        enum: ["terse", "guardrailed", "both"],
        default: "guardrailed",
        description: "'both' generates a terse and a guardrailed variant and judges them head-to-head"
      },
      format: {
        type: "string",
        enum: ["plain", "xml", "markdown", "json"],
        default: "plain",
        description: "Output format for the generated prompt(s)"
      },
      engine: { type: "string", enum: ["ollama", "anthropic"], description: "The underlying LLM engine to use" },
      model: { type: "string", description: "Override for the model" }
    },
    required: ["role"]
  }
};

function renderLint(warnings: LintWarning[]): string {
  return warnings.length === 0
    ? "No lint issues found."
    : `⚠️ **Prompt lint warnings:**\n${warnings.map(w => `- ${w.message}`).join("\n")}`;
}

export async function handleGenerateSystemPrompt(args: {
  role: unknown;
  failure_modes?: string[];
  transcript?: string;
  rigor?: string;
  format?: string;
  engine?: string;
  model?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  if (typeof args.role !== "string") throw new Error("generate_system_prompt requires a string 'role' argument");

  const preset = loadPreset();
  const engine = (args.engine as LLMEngine) ?? preset.engine ?? DEFAULT_ENGINE;
  const model = args.model ?? preset.model ?? (engine === "anthropic" ? "claude-3-5-haiku-latest" : DEFAULT_MODEL);
  const rigor = args.rigor ?? "guardrailed";
  const format = (args.format as PromptFormat) ?? "plain";
  const failureModes = (args.failure_modes ?? []).join("; ");
  const transcript = args.transcript ?? "";
  const glossary = preset.glossary;

  async function generate(variant: "terse" | "guardrailed"): Promise<string> {
    const systemPrompt = getGenerateSystemPromptMeta(variant, args.role as string, failureModes, transcript);
    const response = await generateChat({
      engine, model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the system prompt now." }
      ],
      options: { temperature: 0.3 }
    });
    return extractCodeBlock(response.message.content);
  }

  const content: { type: "text"; text: string }[] = [];

  if (rigor === "both") {
    const [terse, guardrailed] = await Promise.all([generate("terse"), generate("guardrailed")]);

    content.push({ type: "text", text: `**Terse variant:**\n\`\`\`\n${convertFormat(terse, format)}\n\`\`\`` });
    content.push({ type: "text", text: `**Guardrailed variant:**\n\`\`\`\n${convertFormat(guardrailed, format)}\n\`\`\`` });

    const lintWarnings = [
      ...lintOptimizedPrompt("", undefined, terse, undefined, glossary),
      ...lintOptimizedPrompt("", undefined, guardrailed, undefined, glossary)
    ];
    content.push({ type: "text", text: renderLint(lintWarnings) });

    const compareSystemPrompt = COMPARE_SYSTEM_PROMPT
      .split("{{baseline}}").join(terse)
      .split("{{prompt}}").join(guardrailed);
    const judgeResponse = await generateChat({
      engine, model,
      messages: [
        { role: "system", content: compareSystemPrompt },
        { role: "user", content: "Provide the JSON scores now." }
      ],
      options: { temperature: 0.1 }
    });
    const scores = parseJudgeResponse(judgeResponse.message.content, true);
    content.push({ type: "text", text: renderComparison(scores) });
  } else {
    const variant = rigor === "terse" ? "terse" : "guardrailed";
    const generated = await generate(variant);

    content.push({ type: "text", text: `\`\`\`\n${convertFormat(generated, format)}\n\`\`\`` });

    const lintWarnings = lintOptimizedPrompt("", undefined, generated, undefined, glossary);
    content.push({ type: "text", text: renderLint(lintWarnings) });

    const scoreSystemPrompt = SCORE_SYSTEM_PROMPT.split("{{prompt}}").join(generated);
    const judgeResponse = await generateChat({
      engine, model,
      messages: [
        { role: "system", content: scoreSystemPrompt },
        { role: "user", content: "Provide the JSON scores now." }
      ],
      options: { temperature: 0.1 }
    });
    const scores = parseJudgeResponse(judgeResponse.message.content, false);
    content.push({ type: "text", text: renderSingle(scores) });
  }

  return { content };
}
