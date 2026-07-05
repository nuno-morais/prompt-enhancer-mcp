import { DEFAULT_MODEL, type TargetModel } from "./config.js";
import { generateOptimizedPrompt, type ProgressCallback } from "./refine.js";
import { getCacheKey, getCached, setCached, type CachedResult } from "./cache.js";
import { loadPreset } from "./preset.js";

export const OPTIMIZE_PROMPT_TOOL = {
  name: "optimize_prompt",
  description: "Optimizes a rough prompt draft using a local LLM before sending it to a paid API",
  inputSchema: {
    type: "object",
    properties: {
      draft: { type: "string", description: "The raw draft idea" },
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
      explain: {
        type: "boolean",
        default: false,
        description: "When true, includes a 1-line summary of what the critic pass changed, as a second content block"
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
      model: { type: "string", description: "Override for the Ollama model" }
    },
    required: ["draft"]
  }
};

export async function handleOptimizePrompt(
  args: {
    draft: unknown;
    target_model?: TargetModel;
    brainstorm?: boolean;
    explain?: boolean;
    interactive?: boolean;
    session_id?: string;
    model?: string;
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

  const params = {
    draft: args.draft,
    target_model: args.target_model ?? preset.target_model ?? "generic" as TargetModel,
    brainstorm: args.brainstorm ?? preset.brainstorm ?? false,
    explain: args.explain ?? preset.explain ?? false,
    interactive: args.interactive ?? true, // default to true
    session_id: args.session_id,
    model: args.model ?? preset.model ?? DEFAULT_MODEL
  };

  const cacheKey = getCacheKey(params);
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
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
  if (params.explain) {
    content.push({ type: "text", text: result.explanation ?? "" });
  }

  if (params.interactive) {
    content.push({
      type: "text",
      text: "\n---\n**Assistant Instruction:** Here is the optimized prompt. Do NOT execute or answer this prompt yet. Show it to the user and ASK if they want to use it as-is, or if they want to tweak it further."
    });
  }

  const cachedResult: CachedResult = { content };
  setCached(cacheKey, cachedResult);
  return cachedResult;
}
