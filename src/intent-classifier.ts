import { generateChat } from "./llm.js";
import type { LLMEngine } from "./llm.js";
import type { TargetModel } from "./meta-prompts.js";

export type Intent = "web_search" | "user_artifact" | "brainstorm" | "self_contained";

export type IntentResult = {
  intent: Intent;
  artifactName?: string;
};

const INTENT_CLASSIFIER_PROMPT = `
Classify the user's task draft into exactly ONE of these categories:

WEB_SEARCH — answering well requires current/up-to-date information from the web (news, prices, latest versions, recent events).
USER_ARTIFACT — answering requires a specific document, file, or data the user must provide (a config, an article to summarize, code to review) that is NOT included in the draft.
BRAINSTORM — an open-ended ideation request (generate ideas, names, alternatives, possibilities) with no single correct answer.
SELF_CONTAINED — none of the above; the draft contains everything needed.

Answer ONLY with the category token. For USER_ARTIFACT, you may append one
snake_case name for the missing artifact (e.g. "USER_ARTIFACT pipeline_config").
Do not explain.

Examples:
"what are the latest React 19 breaking changes" -> WEB_SEARCH
"summarize this article in 3 sentences" -> USER_ARTIFACT article
"ideas for naming a new coffee shop" -> BRAINSTORM
"write a python function that validates emails" -> SELF_CONTAINED
`.trim();

const INTENT_TOKENS: Record<string, Intent> = {
  WEB_SEARCH: "web_search",
  USER_ARTIFACT: "user_artifact",
  BRAINSTORM: "brainstorm",
  SELF_CONTAINED: "self_contained"
};

export async function classifyIntent(
  draft: string,
  context: string | undefined,
  model: string,
  engine: LLMEngine,
  baseParams: Record<string, unknown>
): Promise<IntentResult> {
  try {
    const userContent = context?.trim()
      ? `<background_context>\n${context}\n</background_context>\n${draft}`
      : draft;

    const response = await generateChat({
      engine,
      model,
      messages: [
        { role: "system", content: INTENT_CLASSIFIER_PROMPT },
        { role: "user", content: userContent }
      ],
      options: {
        ...baseParams,
        num_predict: 20,
        temperature: 0.1
      }
    });

    const answer = response.message.content.trim();
    const [token, name] = answer.split(/\s+/);
    const intent = INTENT_TOKENS[token?.toUpperCase() ?? ""];
    if (!intent) {
      return { intent: "self_contained" };
    }
    if (intent === "user_artifact") {
      const artifactName = name && /^[a-z][a-z0-9_]*$/i.test(name) ? name : "artifact";
      return { intent, artifactName };
    }
    return { intent };
  } catch (error) {
    console.error("Intent classifier failed, defaulting to self_contained:", error);
    return { intent: "self_contained" };
  }
}

export function buildIntentLine(result: IntentResult): string | null {
  switch (result.intent) {
    case "web_search":
      return "Use up-to-date information; search the web before answering.";
    case "user_artifact":
      return `Ask the user to provide {{${result.artifactName ?? "artifact"}}} before proceeding.`;
    default:
      return null;
  }
}

export function injectIntentLine(prompt: string, line: string, targetModel: TargetModel): string {
  if (prompt.includes("<required_capabilities>")) {
    return prompt;
  }

  if (targetModel === "claude" || targetModel === "gemini") {
    return `${prompt}\n\n<required_capabilities>\n${line}\n</required_capabilities>`;
  }
  return `${prompt}\n\n${line}`;
}
