// src/cli-hook.ts
/**
 * CLI entrypoint used as a Claude Code `UserPromptSubmit` hook.
 * It reads a JSON payload from stdin, applies a lightweight skip heuristic,
 * invokes the existing prompt‑enhancement pipeline, and writes the rewrite
 * to stdout (visible in the transcript).
 */
import { generateOptimizedPrompt } from "./refine.js";
import { DEFAULT_MODEL, DEFAULT_ENGINE } from "./config.js";
import { stdin, stdout, stderr } from "node:process";

interface HookPayload {
  hook_event_name: string;
  prompt: string;
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
}

/** Count words using the spec's `/\s+/` split after trimming. */
function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

(async () => {
  // Accumulate stdin data.
  let data = "";
  for await (const chunk of stdin) {
    data += chunk;
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(data) as HookPayload;
  } catch {
    stderr.write("prompt‑enhancer hook: failed to parse JSON payload\n");
    process.exit(0);
  }

  // Skip trivial prompts (≤ 8 words).
  if (wordCount(payload.prompt) <= 8) {
    process.exit(0);
  }

  const timeoutMs = 5000;
  const timeout = new Promise<null>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), timeoutMs)
  );

  // Build parameters for the pipeline – using generic target model and defaults.
  const params = {
    draft: payload.prompt,
    target_model: "generic" as const,
    brainstorm: false,
    explain: false,
    engine: DEFAULT_ENGINE,
    model: DEFAULT_MODEL,
  };

  try {
    const result = await Promise.race([
      generateOptimizedPrompt(params),
      timeout,
    ]) as any;
    if (!result) {
      throw new Error("Timeout or no result from optimisation");
    }
    // The target model is the one we requested; Ollama may resolve differently, but we expose the same value.
    const block = `[prompt‑enhancer rewrite — target_model: ${params.target_model}]\n${result.optimizedPrompt}\n`;
    stdout.write(block);
  } catch {
    stderr.write(
      "prompt‑enhancer: Ollama unavailable or timed out, skipping rewrite\n"
    );
    // Exit 0 with no stdout.
  }
})();
