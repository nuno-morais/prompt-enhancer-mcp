import { getMetaPromptConfig, type TargetModel } from "./meta-prompts.js";
import { generateChat } from "./llm.js";
import type { LLMEngine } from "./llm.js";
import { extractCodeBlock } from "./extract-code-block.js";
import { getSession, saveSession } from "./session.js";
import { requiresCoT, injectCoT } from "./cot-injector.js";
import { generateNegativeConstraints, injectGuardrails } from "./guardrails.js";
import { calculateStats, formatStatsString } from "./stats.js";
import { classifyIntent, buildIntentLine, injectIntentLine, type IntentResult } from "./intent-classifier.js";
import { diffLines } from "./diff.js";
import { lintOptimizedPrompt, type LintWarning } from "./lint.js";
import { formatGlossary } from "./preset.js";
import { loadPromptTemplate } from "./prompt-templates.js";

const CRITIC_SYSTEM_PROMPT = loadPromptTemplate("critic");

const EXPLAIN_SYSTEM_PROMPT = loadPromptTemplate("explain");

const REPAIR_SYSTEM_PROMPT = loadPromptTemplate("repair");

const SKIP_CRITIC_EXPLANATION = "No critic pass (trivial draft).";

export type ProgressCallback = (step: number, total: number, message: string) => void;

function isTrivialDraft(draft: string, targetModel: TargetModel, brainstorm: boolean): boolean {
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  return targetModel === "generic" && brainstorm === false && wordCount <= 15;
}

async function applyIntentLine(
  finalPrompt: string,
  intentPromise: Promise<IntentResult> | undefined,
  intentResult: IntentResult | undefined,
  autoEnabledBrainstorm: boolean,
  targetModel: TargetModel
): Promise<{ finalPrompt: string; intentResult?: IntentResult; intentNote?: string }> {
  if (intentPromise) {
    intentResult = await intentPromise;
  }
  const intentLine = intentResult ? buildIntentLine(intentResult) : null;
  if (intentLine) {
    finalPrompt = injectIntentLine(finalPrompt, intentLine, targetModel);
  }
  let intentNote: string | undefined;
  if (autoEnabledBrainstorm) {
    intentNote = "Detected ideation draft; enabled brainstorm mode.";
  } else if (intentLine) {
    intentNote = `Detected intent: ${intentResult!.intent}; added a capability instruction.`;
  } else if (intentResult?.fallback) {
    const reason = intentResult.fallback === "classifier_error"
      ? "classifier call failed"
      : "classifier returned an unrecognized response";
    intentNote = `Intent classification fell back to self_contained (${reason}); no capability instruction added.`;
  }

  return { finalPrompt, intentResult, intentNote };
}

async function lintAndRepair(
  finalPrompt: string,
  params: { draft: string; context?: string; engine: LLMEngine; model: string;
            auto_repair?: boolean; glossary?: Record<string, string> },
  expectedPlaceholder: string | undefined,
  llmOptions: Record<string, unknown>,
  lintContext: string | undefined
): Promise<{ finalPrompt: string; lintWarnings: LintWarning[]; repairedCount: number }> {
  const warnings = lintOptimizedPrompt(params.draft, lintContext, finalPrompt, expectedPlaceholder, params.glossary);
  const repairable = warnings.filter(w => w.repairable);
  if (params.auto_repair === false || repairable.length === 0) {
    return { finalPrompt, lintWarnings: warnings, repairedCount: 0 };
  }

  const issues = repairable.map(w => {
    if (w.kind === "suspect_expansion" && params.glossary) {
      const glossaryLines = Object.entries(params.glossary).map(([t, m]) => `${t} = ${m}`).join("; ");
      return `- ${w.message} (Authoritative glossary: ${glossaryLines})`;
    }
    return `- ${w.message}`;
  }).join("\n");

  try {
    const repairPrompt = REPAIR_SYSTEM_PROMPT
      .split("{{prompt}}").join(finalPrompt)
      .split("{{issues}}").join(issues);
    const response = await generateChat({
      engine: params.engine,
      model: params.model,
      messages: [
        { role: "system", content: repairPrompt },
        { role: "user", content: "Output the corrected prompt now." }
      ],
      options: llmOptions
    });
    const repaired = extractCodeBlock(response.message.content);
    const remaining = lintOptimizedPrompt(params.draft, lintContext, repaired, expectedPlaceholder, params.glossary);
    const remainingRepairableCount = remaining.filter(w => w.repairable).length;
    const repairedCount = Math.max(0, repairable.length - remainingRepairableCount);
    return { finalPrompt: repaired, lintWarnings: remaining, repairedCount };
  } catch (error) {
    console.error("Repair pass failed, keeping pre-repair prompt:", error);
    return { finalPrompt, lintWarnings: warnings, repairedCount: 0 };
  }
}

export async function generateOptimizedPrompt(
  params: {
    draft: string;
    context?: string;
    target_model: TargetModel;
    brainstorm: boolean | undefined;
    explain: boolean;
    engine: LLMEngine;
    model: string;
    session_id?: string;
    auto_cot?: boolean;
    auto_guardrails?: boolean;
    show_stats?: boolean;
    auto_intent?: boolean;
    show_diff?: boolean;
    auto_repair?: boolean;
    glossary?: Record<string, string>;
  },
  onProgress?: ProgressCallback
): Promise<{ optimizedPrompt: string; explanation?: string; stats?: string; intentResult?: IntentResult; diff?: string; lintWarnings?: LintWarning[]; repairedCount?: number }> {
  const session = params.session_id ? getSession(params.session_id) : undefined;

  const effectiveContext = [params.context, params.glossary ? formatGlossary(params.glossary) : undefined]
    .filter(Boolean).join("\n\n") || undefined;

  const autoIntent = params.auto_intent !== false;
  let intentResult: IntentResult | undefined;
  let intentPromise: Promise<IntentResult> | undefined;
  let brainstorm = params.brainstorm ?? false;
  let autoEnabledBrainstorm = false;

  if (!session && autoIntent) {
    const { params: classifierParams } = getMetaPromptConfig(params.target_model, false);
    if (params.brainstorm === undefined) {
      // Must know the intent before choosing the system prompt
      intentResult = await classifyIntent(params.draft, effectiveContext, params.model, params.engine, classifierParams);
      if (intentResult.intent === "brainstorm") {
        brainstorm = true;
        autoEnabledBrainstorm = true;
      }
    } else {
      // Explicit brainstorm: classify in parallel, use result only for the line
      intentPromise = classifyIntent(params.draft, effectiveContext, params.model, params.engine, classifierParams);
    }
  }

  const { systemPrompt, params: ollamaParams } = getMetaPromptConfig(params.target_model, brainstorm);

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

    const refineResponse = await generateChat({
      engine: params.engine,
      model: params.model,
      messages,
      options: ollamaParams
    });

    const newPrompt = extractCodeBlock(refineResponse.message.content);
    
    messages.push({
      role: "assistant",
      content: refineResponse.message.content
    });

    saveSession(params.session_id!, messages);

    const previousPrompt = extractCodeBlock(session.messages[session.messages.length - 1].content);

    let explanation: string | undefined;
    if (params.explain) {
      onProgress?.(2, 2, "Generating change summary...");
      const explainPrompt = EXPLAIN_SYSTEM_PROMPT
        .split("{{draft_a}}").join(previousPrompt)
        .split("{{draft_b}}").join(newPrompt);

      const explainResponse = await generateChat({
        engine: params.engine,
        model: params.model,
        messages: [
          { role: "system", content: explainPrompt },
          { role: "user", content: "Provide the one-sentence summary now." }
        ],
        options: ollamaParams
      });
      explanation = explainResponse.message.content.trim();
    }

    let stats: string | undefined;
    if (params.show_stats) {
      stats = formatStatsString(calculateStats(params.draft, newPrompt));
    }

    const lintWarnings = lintOptimizedPrompt(params.draft, effectiveContext, newPrompt, undefined, params.glossary);

    return {
      optimizedPrompt: newPrompt,
      explanation,
      stats,
      diff: params.show_diff ? diffLines(previousPrompt, newPrompt) : undefined,
      lintWarnings,
      repairedCount: 0
    };
  }

  const willRunCritic = !isTrivialDraft(params.draft, params.target_model, brainstorm);
  const total = willRunCritic ? (params.explain ? 3 : 2) : (params.explain ? 1 : 0);

  if (total > 0) {
    onProgress?.(1, total, "Generating initial draft...");
  }

  const cotCheckPromise = params.auto_cot 
    ? requiresCoT(params.draft, params.model, params.engine, ollamaParams)
    : Promise.resolve(false);

  const guardrailsPromise = params.auto_guardrails
    ? generateNegativeConstraints(params.draft, params.model, params.engine, ollamaParams)
    : Promise.resolve(null);

  const userDraftBlock = `<user_draft>\n${params.draft}\n</user_draft>`;
  const userMessageContent = effectiveContext?.trim()
    ? `<background_context>\n${effectiveContext}\n</background_context>\n${userDraftBlock}`
    : userDraftBlock;

  const messages: import("./llm.js").ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessageContent }
  ];

  const firstResponse = await generateChat({
    engine: params.engine,
    model: params.model,
    messages,
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

    let intentNote: string | undefined;
    ({ finalPrompt, intentResult, intentNote } = await applyIntentLine(finalPrompt, intentPromise, intentResult, autoEnabledBrainstorm, params.target_model));

    const expectedPlaceholder = intentResult?.intent === "user_artifact"
      ? `{{${intentResult.artifactName ?? "artifact"}}}`
      : undefined;
    const repairOutcome = await lintAndRepair(finalPrompt, params, expectedPlaceholder, ollamaParams, effectiveContext);
    finalPrompt = repairOutcome.finalPrompt;

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
      explanation: params.explain
        ? (intentNote ? `${SKIP_CRITIC_EXPLANATION} ${intentNote}` : SKIP_CRITIC_EXPLANATION)
        : undefined,
      stats,
      intentResult,
      diff: params.show_diff ? "(critic pass skipped — no diff available)" : undefined,
      lintWarnings: repairOutcome.lintWarnings,
      repairedCount: repairOutcome.repairedCount
    };
  }

  onProgress?.(2, total, "Reviewing draft with critic pass...");

  const criticPrompt = CRITIC_SYSTEM_PROMPT
    .split("{{first_draft_prompt}}").join(firstDraftPrompt)
    .split("{{original_draft}}").join(params.draft);

  const secondResponse = await generateChat({
    engine: params.engine,
    model: params.model,
    messages: [
      { role: "system", content: criticPrompt },
      { role: "user", content: "Run the critique process and provide the final optimized prompt now." }
    ],
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

  let intentNote: string | undefined;
  ({ finalPrompt, intentResult, intentNote } = await applyIntentLine(finalPrompt, intentPromise, intentResult, autoEnabledBrainstorm, params.target_model));

  const expectedPlaceholder = intentResult?.intent === "user_artifact"
    ? `{{${intentResult.artifactName ?? "artifact"}}}`
    : undefined;
  const repairOutcome = await lintAndRepair(finalPrompt, params, expectedPlaceholder, ollamaParams, effectiveContext);
  finalPrompt = repairOutcome.finalPrompt;

  const diff = params.show_diff ? diffLines(firstDraftPrompt, finalPrompt) : undefined;

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
    return {
      optimizedPrompt: finalPrompt,
      stats,
      intentResult,
      diff,
      lintWarnings: repairOutcome.lintWarnings,
      repairedCount: repairOutcome.repairedCount
    };
  }

  onProgress?.(3, total, "Generating change summary...");

  const explainPrompt = EXPLAIN_SYSTEM_PROMPT
    .split("{{draft_a}}").join(firstDraftPrompt)
    .split("{{draft_b}}").join(finalPrompt);

  const explainResponse = await generateChat({
    engine: params.engine,
    model: params.model,
    messages: [
      { role: "system", content: explainPrompt },
      { role: "user", content: "Provide the one-sentence summary now." }
    ],
    options: ollamaParams
  });

  return {
    optimizedPrompt: finalPrompt,
    explanation: intentNote
      ? `${explainResponse.message.content.trim()} ${intentNote}`
      : explainResponse.message.content.trim(),
    stats,
    intentResult,
    diff,
    lintWarnings: repairOutcome.lintWarnings,
    repairedCount: repairOutcome.repairedCount
  };
}
