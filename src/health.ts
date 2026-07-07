import { DEFAULT_ENGINE } from "./config.js";
import { loadPreset } from "./preset.js";
import type { LLMEngine } from "./llm.js";

export const CHECK_HEALTH_TOOL = {
  name: "check_health",
  description: "Checks whether the configured LLM engine (Ollama or Anthropic) is reachable and ready to use",
  inputSchema: {
    type: "object",
    properties: {
      engine: {
        type: "string",
        description: "The engine to check (ollama or anthropic). Defaults to the configured/preset engine."
      },
      model: {
        type: "string",
        description: "Override for the model to check availability for (Ollama only). Defaults to the configured/preset model."
      }
    }
  }
};

export async function handleCheckHealth(
  args: { engine?: string; model?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const preset = loadPreset();
  const engine = (args.engine as LLMEngine) ?? preset.engine ?? DEFAULT_ENGINE;

  if (engine === "anthropic") {
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    const text = hasKey
      ? "✅ Anthropic engine configured (ANTHROPIC_API_KEY is set)."
      : "❌ Anthropic engine not configured: ANTHROPIC_API_KEY environment variable is not set.";
    return { content: [{ type: "text", text }] };
  }

  throw new Error("Ollama health check not yet implemented");
}
