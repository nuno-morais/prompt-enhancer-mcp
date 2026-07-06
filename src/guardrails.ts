import { generateChat } from "./llm.js";
import type { LLMEngine } from "./llm.js";

const GUARDRAILS_SYSTEM_PROMPT = `
Analyze the user's task. Identify the 1 to 3 most likely ways an AI model might hallucinate, add unnecessary filler, or make mistakes when completing this specific task.
Respond ONLY with a bulleted list of strict negative constraints. Do not include any introductory text, pleasantries, or explanations. Start each bullet point with "- DO NOT".

Examples of good negative constraints:
- DO NOT write an introduction or conclusion.
- DO NOT invent external APIs or third-party libraries.
- DO NOT hallucinate facts; state if you don't know.
- DO NOT apologize or be conversational.
`.trim();

export async function generateNegativeConstraints(
  draft: string,
  model: string,
  engine: LLMEngine,
  baseParams: Record<string, unknown>
): Promise<string[] | null> {
  try {
    const response = await generateChat({
      engine,
      model,
      messages: [
        { role: "system", content: GUARDRAILS_SYSTEM_PROMPT },
        { role: "user", content: draft }
      ],
      options: {
        ...baseParams,
        num_predict: 150,
        temperature: 0.1
      }
    });

    const constraints = response.message.content.trim();
    if (constraints && constraints.includes("- DO NOT")) {
      return constraints.split('\n').filter(line => line.startsWith('- DO NOT'));
    }
    return null;
  } catch (error) {
    console.error("Guardrails generator failed, defaulting to null:", error);
    return null;
  }
}

export function injectGuardrails(prompt: string, constraints: string[]): string {
  if (prompt.includes("<negative_constraints>")) {
    return prompt;
  }

  const guardrailsBlock = `<negative_constraints>\n${constraints.join("\n")}\n</negative_constraints>`;
  return `${prompt}\n\n${guardrailsBlock}`;
}
