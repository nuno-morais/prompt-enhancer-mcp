import { getMetaPromptConfig, type TargetModel } from "./meta-prompts.js";
import { ollamaChat, type OllamaChatMessage } from "./ollama-client.js";
import { extractCodeBlock } from "./extract-code-block.js";
import { getSession, saveSession } from "./session.js";
import { requiresCoT, injectCoT } from "./cot-injector.js";
import { generateNegativeConstraints, injectGuardrails } from "./guardrails.js";
import { calculateStats, formatStatsString } from "./stats.js";

const CRITIC_SYSTEM_PROMPT = `
You are a meticulous Prompt Engineering reviewer. You will receive the ORIGINAL
user draft and a FIRST DRAFT of an optimized prompt produced from it, both
delimited by tags below. Your job is to produce a FINAL, IMPROVED version of
the optimized prompt.

Check the first draft for: ambiguity, missing context the target model would
need, unstated assumptions, and requirements implied by the original draft but
missing from the first draft. Fix what's wrong; keep what's already good.
Do not change the prompt's overall format or structure (e.g. XML tags, JSON
request, persona instructions) unless it is factually wrong for the stated goal.

STRICT RULES (must not be broken):
1. Your response must contain ONLY the final optimized prompt, inside a
   markdown code block with a language qualifier (e.g. \`\`\`text), and nothing else.
2. NEVER write text before or after the code block.
3. NEVER add commentary about what you changed. Just output the final prompt.

<original_draft>
{{original_draft}}
</original_draft>

<first_draft_prompt>
{{first_draft_prompt}}
</first_draft_prompt>

Now output the final, improved prompt.
`;

const EXPLAIN_SYSTEM_PROMPT = `
You are a technical writer. You will be given DRAFT A and DRAFT B, both
versions of an optimized prompt for an AI model, delimited by tags below.
Describe in ONE short sentence what changed from A to B. Focus on
substantive differences (added constraints, fixed ambiguity, structural
changes) — ignore purely cosmetic wording changes.

STRICT RULES:
1. Output ONLY the one-sentence summary. No preamble, no code block, no quotes.
2. If A and B are effectively identical, say so explicitly (e.g. "No substantive changes.").

<draft_a>
{{draft_a}}
</draft_a>

<draft_b>
{{draft_b}}
</draft_b>
`;

const SKIP_CRITIC_EXPLANATION = "No critic pass (trivial draft).";

export type ProgressCallback = (step: number, total: number, message: string) => void;

function isTrivialDraft(draft: string, targetModel: TargetModel, brainstorm: boolean): boolean {
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  return targetModel === "generic" && brainstorm === false && wordCount <= 15;
}

export async function generateOptimizedPrompt(
  params: {
    draft: string;
    target_model: TargetModel;
    brainstorm: boolean;
    explain: boolean;
    model: string;
    session_id?: string;
    auto_cot?: boolean;
    auto_guardrails?: boolean;
    show_stats?: boolean;
  },
  onProgress?: ProgressCallback
): Promise<{ optimizedPrompt: string; explanation?: string; stats?: string }> {
  const { systemPrompt, params: ollamaParams } = getMetaPromptConfig(params.target_model, params.brainstorm);

  const session = params.session_id ? getSession(params.session_id) : undefined;

  if (session) {
    if (params.explain) {
      onProgress?.(1, 2, "Refining prompt based on feedback...");
    } else {
      onProgress?.(1, 1, "Refining prompt based on feedback...");
    }

    const messages = [...session.messages];
    messages.push({
      role: "user",
      content: `The user provided the following feedback on the last iteration:\n\n<feedback>\n${params.draft}\n</feedback>\n\nPlease update the optimized prompt based on this feedback. Output ONLY the new optimized prompt in a markdown code block, just like before.`
    });

    const refineResponse = await ollamaChat({
      model: params.model,
      messages,
      stream: false,
      options: ollamaParams
    });

    const newPrompt = extractCodeBlock(refineResponse.message.content);
    
    messages.push({
      role: "assistant",
      content: refineResponse.message.content
    });

    saveSession(params.session_id!, messages);

    let explanation: string | undefined;
    if (params.explain) {
      onProgress?.(2, 2, "Generating change summary...");
      const previousPrompt = extractCodeBlock(session.messages[session.messages.length - 1].content);
      const explainPrompt = EXPLAIN_SYSTEM_PROMPT
        .split("{{draft_a}}").join(previousPrompt)
        .split("{{draft_b}}").join(newPrompt);

      const explainResponse = await ollamaChat({
        model: params.model,
        messages: [
          { role: "system", content: explainPrompt },
          { role: "user", content: "Provide the one-sentence summary now." }
        ],
        stream: false,
        options: ollamaParams
      });
      explanation = explainResponse.message.content.trim();
    }

    let stats: string | undefined;
    if (params.show_stats) {
      stats = formatStatsString(calculateStats(params.draft, newPrompt));
    }

    return {
      optimizedPrompt: newPrompt,
      explanation,
      stats
    };
  }

  const willRunCritic = !isTrivialDraft(params.draft, params.target_model, params.brainstorm);
  const total = willRunCritic ? (params.explain ? 3 : 2) : (params.explain ? 1 : 0);

  if (total > 0) {
    onProgress?.(1, total, "Generating initial draft...");
  }

  const cotCheckPromise = params.auto_cot 
    ? requiresCoT(params.draft, params.model, ollamaParams)
    : Promise.resolve(false);

  const guardrailsPromise = params.auto_guardrails
    ? generateNegativeConstraints(params.draft, params.model, ollamaParams)
    : Promise.resolve(null);

  let messages: OllamaChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `<user_draft>\n${params.draft}\n</user_draft>` }
  ];

  const firstResponse = await ollamaChat({
    model: params.model,
    messages,
    stream: false,
    options: ollamaParams
  });
  const firstDraftPrompt = extractCodeBlock(firstResponse.message.content);

  if (!willRunCritic) {
    let finalPrompt = firstDraftPrompt;
    const [needsCoT, constraints] = await Promise.all([cotCheckPromise, guardrailsPromise]);
    if (needsCoT) {
      finalPrompt = injectCoT(finalPrompt, params.target_model);
    }
    if (constraints) {
      finalPrompt = injectGuardrails(finalPrompt, constraints);
    }

    if (params.session_id) {
      messages.push({
        role: "assistant",
        content: `\`\`\`text\n${finalPrompt}\n\`\`\``
      });
      saveSession(params.session_id, messages);
    }
    let stats: string | undefined;
    if (params.show_stats) {
      stats = formatStatsString(calculateStats(params.draft, finalPrompt));
    }

    return {
      optimizedPrompt: finalPrompt,
      explanation: params.explain ? SKIP_CRITIC_EXPLANATION : undefined,
      stats
    };
  }

  onProgress?.(2, total, "Reviewing draft with critic pass...");

  const criticPrompt = CRITIC_SYSTEM_PROMPT
    .split("{{first_draft_prompt}}").join(firstDraftPrompt)
    .split("{{original_draft}}").join(params.draft);

  const secondResponse = await ollamaChat({
    model: params.model,
    messages: [
      { role: "system", content: criticPrompt },
      { role: "user", content: "Run the critique process and provide the final optimized prompt now." }
    ],
    stream: false,
    options: ollamaParams
  });
  let finalPrompt = extractCodeBlock(secondResponse.message.content);

  const [needsCoT, constraints] = await Promise.all([cotCheckPromise, guardrailsPromise]);
  if (needsCoT) {
    finalPrompt = injectCoT(finalPrompt, params.target_model);
  }
  if (constraints) {
    finalPrompt = injectGuardrails(finalPrompt, constraints);
  }

  if (params.session_id) {
    messages.push({
      role: "assistant",
      content: `\`\`\`text\n${finalPrompt}\n\`\`\``
    });
    saveSession(params.session_id, messages);
  }

  let stats: string | undefined;
  if (params.show_stats) {
    stats = formatStatsString(calculateStats(params.draft, finalPrompt));
  }

  if (!params.explain) {
    return { optimizedPrompt: finalPrompt, stats };
  }

  onProgress?.(3, total, "Generating change summary...");

  const explainPrompt = EXPLAIN_SYSTEM_PROMPT
    .split("{{draft_a}}").join(firstDraftPrompt)
    .split("{{draft_b}}").join(finalPrompt);

  const explainResponse = await ollamaChat({
    model: params.model,
    messages: [
      { role: "system", content: explainPrompt },
      { role: "user", content: "Provide the one-sentence summary now." }
    ],
    stream: false,
    options: ollamaParams
  });

  return {
    optimizedPrompt: finalPrompt,
    explanation: explainResponse.message.content.trim(),
    stats
  };
}
