import { DEFAULT_ENGINE, DEFAULT_MODEL, OLLAMA_BASE_URL } from "./config.js";
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

  const model = args.model ?? preset.model ?? DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  } catch (err) {
    if (err instanceof TypeError && err.message === "fetch failed") {
      return {
        content: [{
          type: "text",
          text: `❌ Could not reach Ollama at ${OLLAMA_BASE_URL}. Is Ollama running? Try 'ollama serve'.`
        }]
      };
    }
    throw err;
  }

  if (!response.ok) {
    return {
      content: [{
        type: "text",
        text: `❌ Ollama at ${OLLAMA_BASE_URL} responded with an error: ${response.status} ${response.statusText}`
      }]
    };
  }

  const data = await response.json() as { models?: Array<{ name: string; model: string }> };
  const models = data.models ?? [];
  const stripTag = (s: string) => s.replace(/:latest$/, "");
  const modelAvailable = models.some(
    m => stripTag(m.model) === stripTag(model) || stripTag(m.name) === stripTag(model)
  );

  if (!modelAvailable) {
    return {
      content: [{
        type: "text",
        text: `⚠️ Ollama is reachable at ${OLLAMA_BASE_URL}, but model '${model}' is not pulled. Run: ollama pull ${model}`
      }]
    };
  }

  return {
    content: [{
      type: "text",
      text: `✅ Ollama reachable at ${OLLAMA_BASE_URL}, model '${model}' available.`
    }]
  };
}
