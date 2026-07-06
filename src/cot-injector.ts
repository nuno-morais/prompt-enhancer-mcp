import { generateChat } from "./llm.js";
import type { LLMEngine } from "./llm.js";
import type { TargetModel } from "./meta-prompts.js";

const COT_CLASSIFIER_PROMPT = `
Analyze the following user task/draft. Does it require complex logical reasoning, coding, mathematical calculation, multi-step planning, or problem solving? 
Answer ONLY with the word YES or NO. Do not explain.
`.trim();

export async function requiresCoT(
  draft: string,
  model: string,
  engine: LLMEngine,
  baseParams: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await generateChat({
      engine,
      model,
      messages: [
        { role: "system", content: COT_CLASSIFIER_PROMPT },
        { role: "user", content: draft }
      ],
      options: {
        ...baseParams,
        num_predict: 10,
        temperature: 0.1
      }
    });

    return response.message.content.trim().toUpperCase().includes("YES");
  } catch (error) {
    // If the fast classifier fails for any reason, default to false so we don't break the main pipeline
    console.error("CoT classifier failed, defaulting to false:", error);
    return false;
  }
}

export function injectCoT(prompt: string, targetModel: TargetModel): string {
  // If the prompt already seems to have CoT instructions, skip
  if (
    prompt.includes("<thinking>") || 
    prompt.toLowerCase().includes("step-by-step") || 
    prompt.includes("<scratchpad>")
  ) {
    return prompt;
  }

  let cotInstruction = "";
  switch (targetModel) {
    case "claude":
      cotInstruction = `**Critical Instruction**: Before providing your final response, you MUST think through the problem step-by-step. Write your internal reasoning process inside \`<thinking>\` tags, and then provide your final answer inside \`<answer>\` tags.`;
      break;
    case "gemini":
      cotInstruction = `**Critical Instruction**: Before providing your final response, outline your thought process and planning inside a \`<scratchpad>\` block. Then, provide your final response.`;
      break;
    case "gpt4o":
      cotInstruction = `**Critical Instruction**: Think step-by-step. First, write down your reasoning and plan, and then output your final answer.`;
      break;
    case "generic":
    default:
      cotInstruction = `**Critical Instruction**: Please think through this problem step-by-step before providing your final answer.`;
      break;
  }

  return `${prompt}\n\n${cotInstruction}`;
}
