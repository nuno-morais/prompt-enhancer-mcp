import { generateChat, type LLMEngine } from "./llm.js";
import { extractCodeBlock } from "./extract-code-block.js";
import { loadPreset } from "./preset.js";
import { DEFAULT_MODEL, DEFAULT_ENGINE } from "./config.js";
import { SCORE_SYSTEM_PROMPT, COMPARE_SYSTEM_PROMPT } from "./meta-prompts.js";

export const DIMENSIONS = ["clarity", "specificity", "structure", "guardrails", "token_efficiency"] as const;
type Dimension = (typeof DIMENSIONS)[number];
type DimScore = { score: number; why: string };
export type JudgeScores = { prompt: Record<Dimension, DimScore>; baseline?: Record<Dimension, DimScore> };

export const SCORE_PROMPT_TOOL = {
  name: "score_prompt",
  description: "Judge-grades a prompt 1-5 on clarity, specificity, structure, guardrails, and token efficiency. Pass 'baseline' to compare two prompts and get per-dimension deltas and a verdict.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The prompt to score" },
      baseline: { type: "string", description: "Optional second prompt; switches to comparison mode (baseline vs prompt)" },
      engine: { type: "string", enum: ["ollama", "anthropic"], description: "The underlying LLM engine to use" },
      model: { type: "string", description: "Override for the judge model" }
    },
    required: ["prompt"]
  }
};

function parseSide(obj: unknown, side: string): Record<Dimension, DimScore> {
  if (typeof obj !== "object" || obj === null) throw new Error(`Judge response missing "${side}" object`);
  const rec = obj as Record<string, unknown>;
  const out = {} as Record<Dimension, DimScore>;
  for (const dim of DIMENSIONS) {
    const entry = rec[dim] as { score?: unknown; why?: unknown } | undefined;
    if (!entry || typeof entry.score !== "number") throw new Error(`Judge response missing dimension "${dim}" in "${side}"`);
    if (!Number.isInteger(entry.score) || entry.score < 1 || entry.score > 5) {
      throw new Error(`Judge score for "${dim}" is out of range (must be an integer 1-5): ${entry.score}`);
    }
    out[dim] = { score: entry.score, why: typeof entry.why === "string" ? entry.why : "" };
  }
  return out;
}

export function parseJudgeResponse(raw: string, expectBaseline: boolean): JudgeScores {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeBlock(raw));
  } catch {
    throw new Error("Judge returned a malformed (non-JSON) response — try again or use a different model.");
  }
  const obj = parsed as Record<string, unknown>;
  const result: JudgeScores = { prompt: parseSide(obj.prompt, "prompt") };
  if (expectBaseline) result.baseline = parseSide(obj.baseline, "baseline");
  return result;
}

export function computeOverall(scores: Record<string, number>): number {
  const values = Object.values(scores);
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function verdict(promptOverall: number, baselineOverall: number): "prompt" | "baseline" | "tie" {
  if (Math.abs(promptOverall - baselineOverall) <= 0.25) return "tie";
  return promptOverall > baselineOverall ? "prompt" : "baseline";
}

function overallOf(side: Record<Dimension, DimScore>): number {
  return computeOverall(Object.fromEntries(DIMENSIONS.map(d => [d, side[d].score])));
}

function renderSingle(scores: JudgeScores): string {
  const rows = DIMENSIONS.map(d => `| ${d} | ${scores.prompt[d].score} | ${scores.prompt[d].why} |`).join("\n");
  return `| Dimension | Score | Why |\n|---|---|---|\n${rows}\n\n**Overall: ${overallOf(scores.prompt)} / 5**`;
}

function renderComparison(scores: JudgeScores): string {
  const b = scores.baseline!;
  const rows = DIMENSIONS.map(d => {
    const delta = scores.prompt[d].score - b[d].score;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    return `| ${d} | ${b[d].score} | ${scores.prompt[d].score} | ${deltaStr} |`;
  }).join("\n");
  const po = overallOf(scores.prompt);
  const bo = overallOf(b);
  return `| Dimension | Baseline | Prompt | Δ |\n|---|---|---|---|\n${rows}\n\n**Overall:** baseline ${bo} / 5, prompt ${po} / 5\nVerdict: **${verdict(po, bo)}**`;
}

export async function handleScorePrompt(args: {
  prompt: unknown; baseline?: string; engine?: string; model?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  if (typeof args.prompt !== "string") throw new Error("score_prompt requires a string 'prompt' argument");
  const preset = loadPreset();
  const engine = (args.engine as LLMEngine) ?? preset.engine ?? DEFAULT_ENGINE;
  const model = args.model ?? preset.model ?? (engine === "anthropic" ? "claude-3-5-haiku-latest" : DEFAULT_MODEL);
  const comparison = typeof args.baseline === "string";

  const systemPrompt = comparison
    ? COMPARE_SYSTEM_PROMPT.split("{{baseline}}").join(args.baseline!).split("{{prompt}}").join(args.prompt)
    : SCORE_SYSTEM_PROMPT.split("{{prompt}}").join(args.prompt);

  const response = await generateChat({
    engine, model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Provide the JSON scores now." }
    ],
    options: { temperature: 0.1 }
  });

  const scores = parseJudgeResponse(response.message.content, comparison);
  const text = comparison ? renderComparison(scores) : renderSingle(scores);
  return { content: [{ type: "text", text }] };
}
