import { DEFAULT_MODEL, DEFAULT_ENGINE, type TargetModel } from "./config.js";
import type { LLMEngine } from "./llm.js";
import { generateOptimizedPrompt, type ProgressCallback } from "./refine.js";
import { getCacheKey, getCached, setCached, type CachedResult } from "./cache.js";
import { loadPreset, type Verbosity } from "./preset.js";
import { scanProject } from "./context-scanner.js";

export const OPTIMIZE_PROMPT_TOOL = {
  name: "optimize_prompt",
  description: "Optimizes a rough prompt draft using a local LLM before sending it to a paid API",
  inputSchema: {
    type: "object",
    properties: {
      draft: { type: "string", description: "The raw draft idea" },
      auto_context: {
        type: "boolean",
        default: false,
        description: "Automatically scan the local project (package.json, git) for context to append to the prompt."
      },
      context: {
        type: "string",
        description: "Optional background/domain context (project description, glossary, relevant facts) to help the model correctly interpret domain-specific terms in the draft"
      },
      target_model: {
        type: "string",
        enum: ["generic", "claude", "gpt4o", "gemini"],
        default: "generic",
        description: "The target API/format this prompt will be sent to"
      },
      brainstorm: {
        type: "boolean",
        default: false,
        description: "When true, instructs the target model to generate multiple personas/perspectives for open-ended brainstorming"
      },
      verbosity: {
        type: "string",
        enum: ["quiet", "explain", "verbose"],
        default: "quiet",
        description: "How much detail to return alongside the optimized prompt: 'quiet' = prompt only, 'explain' = plus a 1-line summary of what the critic pass changed, 'verbose' = plus token stats and a critic-pass diff. The legacy explain/show_stats/show_diff booleans are still accepted and override this."
      },
      interactive: {
        type: "boolean",
        default: true,
        description: "When true, instructs the calling assistant to pause and ask for user approval before answering the optimized prompt. Defaults to true to allow iteration."
      },
      session_id: {
        type: "string",
        description: "Optional ID to maintain conversation state. Provide a unique string. When making tweaks to a previously generated prompt, pass the same session_id."
      },
      auto: {
        type: "boolean",
        default: true,
        description: "Master switch for all automatic enhancement passes: Chain-of-Thought injection, anti-hallucination guardrails, intent classification, and lint auto-repair. The legacy auto_cot/auto_guardrails/auto_intent/auto_repair booleans are still accepted and override this per pass."
      },
      engine: { type: "string", enum: ["ollama", "anthropic", "sampling"], description: "The underlying LLM engine to use" },
      model: { type: "string", description: "Override for the model" }
    },
    required: ["draft"]
  }
};

export async function handleOptimizePrompt(
  args: {
    draft: unknown;
    context?: string;
    auto_context?: boolean;
    target_model?: TargetModel;
    brainstorm?: boolean;
    auto?: boolean;
    verbosity?: Verbosity;
    explain?: boolean;
    interactive?: boolean;
    session_id?: string;
    auto_cot?: boolean;
    auto_guardrails?: boolean;
    show_stats?: boolean;
    show_diff?: boolean;
    engine?: string;
    model?: string;
    auto_intent?: boolean;
    auto_repair?: boolean;
  },
  progress?: {
    token: string | number;
    sendNotification: (notification: unknown) => Promise<void>;
  }
): Promise<CachedResult> {
  if (typeof args.draft !== "string") {
    throw new Error("optimize_prompt requires a string 'draft' argument");
  }

  const preset = loadPreset();

  const glossary = preset.glossary;

  // Collapsed switches: `auto` covers the four auto_* passes, `verbosity` the
  // three display flags. Precedence per flag: explicit individual arg >
  // collapsed arg > individual preset key > collapsed preset key > default.
  const verbosityFlags = (v?: Verbosity) =>
    v === undefined
      ? { explain: undefined, show_stats: undefined, show_diff: undefined }
      : { explain: v !== "quiet", show_stats: v === "verbose", show_diff: v === "verbose" };
  const argV = verbosityFlags(args.verbosity);
  const presetV = verbosityFlags(preset.verbosity);

  let finalContext = args.context;
  if (args.auto_context) {
    try {
      const autoContext = await scanProject(process.cwd());
      if (autoContext) {
        finalContext = finalContext ? `${finalContext}\n\n${autoContext}` : autoContext;
      }
    } catch (error) {
      console.warn("Failed to scan project for auto_context:", error);
    }
  }

  const params = {
    draft: args.draft,
    context: finalContext,
    glossary,
    target_model: args.target_model ?? preset.target_model ?? "generic" as TargetModel,
    brainstorm: args.brainstorm ?? preset.brainstorm,
    explain: args.explain ?? argV.explain ?? preset.explain ?? presetV.explain ?? false,
    interactive: args.interactive ?? true, // default to true
    session_id: args.session_id,
    auto_cot: args.auto_cot ?? args.auto ?? preset.auto ?? true,
    auto_guardrails: args.auto_guardrails ?? args.auto ?? preset.auto ?? true,
    show_stats: args.show_stats ?? argV.show_stats ?? preset.show_stats ?? presetV.show_stats ?? false,
    show_diff: args.show_diff ?? argV.show_diff ?? preset.show_diff ?? presetV.show_diff ?? false,
    engine: (args.engine as LLMEngine) ?? preset.engine ?? DEFAULT_ENGINE,
    model: args.model ?? preset.model ?? (
      (args.engine === "anthropic" || preset.engine === "anthropic")
        ? "claude-3-5-haiku-latest"
        : DEFAULT_MODEL
    ),
    auto_intent: args.auto_intent ?? args.auto ?? preset.auto_intent ?? preset.auto ?? true,
    auto_repair: args.auto_repair ?? args.auto ?? preset.auto_repair ?? preset.auto ?? true
  };

  const useCache = !params.session_id;
  const cacheKey = useCache ? getCacheKey({ ...params, brainstorm: params.brainstorm ?? null }) : null;
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const onProgress: ProgressCallback | undefined = progress
    ? (step, total, message) => {
        progress.sendNotification({
          method: "notifications/progress",
          params: { progressToken: progress.token, progress: step, total, message }
        }).catch((err) => {
          console.error("Failed to send progress notification:", err);
        });
      }
    : undefined;

  const result = onProgress
    ? await generateOptimizedPrompt(params, onProgress)
    : await generateOptimizedPrompt(params);

  const content: CachedResult["content"] = [{ type: "text", text: result.optimizedPrompt }];
  if (params.explain && result.explanation) {
    content.push({ type: "text", text: result.explanation });
  }

  if (params.show_stats && result.stats) {
    content.push({ type: "text", text: result.stats });
  }

  if (params.show_diff && result.diff) {
    content.push({
      type: "text",
      text: `🔍 **Critic pass diff (first draft → final):**\n\`\`\`diff\n${result.diff}\n\`\`\``
    });
  }

  if (result.repairedCount && result.repairedCount > 0) {
    content.push({ type: "text", text: `✅ ${result.repairedCount} issue(s) auto-repaired.` });
  }
  if (result.lintWarnings && result.lintWarnings.length > 0) {
    content.push({
      type: "text",
      text: `⚠️ **Prompt lint warnings:**\n${result.lintWarnings.map(w => `- ${w.message}`).join("\n")}`
    });
  }

  if (params.interactive) {
    content.push({
      type: "text",
      text: "\n---\n**Assistant Instruction:** Here is the optimized prompt. Do NOT execute or answer this prompt yet. Show it to the user and ASK if they want to use it as-is, or if they want to tweak it further."
    });
  }

  const cachedResult: CachedResult = { content };
  if (cacheKey) {
    setCached(cacheKey, cachedResult);
  }
  return cachedResult;
}
