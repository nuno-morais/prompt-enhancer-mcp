import { getMetaPromptConfig, type TargetModel } from "./meta-prompts.js";
import { generateChat, type ChatMessage } from "./llm.js";
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

type Params = {
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
};

type Result = {
  optimizedPrompt: string;
  explanation?: string;
  stats?: string;
  intentResult?: IntentResult;
  diff?: string;
  lintWarnings?: LintWarning[];
  repairedCount?: number;
};

// Shared state threaded through the pipeline passes below. Each pass reads
// what earlier passes produced and writes its own contribution.
type Ctx = {
  params: Params;
  onProgress?: ProgressCallback;
  effectiveContext?: string;
  brainstorm: boolean;
  autoEnabledBrainstorm: boolean;
  intentPromise?: Promise<IntentResult>;
  intentResult?: IntentResult;
  intentNote?: string;
  systemPrompt: string;
  ollamaParams: Record<string, unknown>;
  messages: ChatMessage[];
  willRunCritic: boolean;
  totalSteps: number;
  cotCheckPromise: Promise<boolean>;
  guardrailsPromise: Promise<string[] | null>;
  firstDraftPrompt: string;
  finalPrompt: string;
  lintWarnings: LintWarning[];
  repairedCount: number;
};

function isTrivialDraft(draft: string, targetModel: TargetModel, brainstorm: boolean): boolean {
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  return targetModel === "generic" && brainstorm === false && wordCount <= 15;
}

async function runExplainCall(draftA: string, draftB: string, params: Params, options: Record<string, unknown>): Promise<string> {
  const explainPrompt = EXPLAIN_SYSTEM_PROMPT
    .split("{{draft_a}}").join(draftA)
    .split("{{draft_b}}").join(draftB);
  const response = await generateChat({
    engine: params.engine,
    model: params.model,
    messages: [
      { role: "system", content: explainPrompt },
      { role: "user", content: "Provide the one-sentence summary now." }
    ],
    options
  });
  return response.message.content.trim();
}

// --- pipeline passes (fresh drafts; session refinement has its own flow) ---

// Classifies the draft's intent. When brainstorm wasn't set explicitly, the
// result must be known before the system prompt is chosen (ideation drafts
// auto-enable brainstorm), so we await it; otherwise it runs in parallel and
// is only consumed later by the intent-line pass.
async function classifyIntentPass(ctx: Ctx): Promise<void> {
  const { params } = ctx;
  if (params.auto_intent === false) return;
  const { params: classifierParams } = getMetaPromptConfig(params.target_model, false);
  if (params.brainstorm === undefined) {
    ctx.intentResult = await classifyIntent(params.draft, ctx.effectiveContext, params.model, params.engine, classifierParams);
    if (ctx.intentResult.intent === "brainstorm") {
      ctx.brainstorm = true;
      ctx.autoEnabledBrainstorm = true;
    }
  } else {
    ctx.intentPromise = classifyIntent(params.draft, ctx.effectiveContext, params.model, params.engine, classifierParams);
  }
}

async function firstDraftPass(ctx: Ctx): Promise<void> {
  const { params } = ctx;
  if (ctx.totalSteps > 0) {
    ctx.onProgress?.(1, ctx.totalSteps, "Generating initial draft...");
  }

  const userDraftBlock = `<user_draft>\n${params.draft}\n</user_draft>`;
  const userMessageContent = ctx.effectiveContext?.trim()
    ? `<background_context>\n${ctx.effectiveContext}\n</background_context>\n${userDraftBlock}`
    : userDraftBlock;

  ctx.messages = [
    { role: "system", content: ctx.systemPrompt },
    { role: "user", content: userMessageContent }
  ];

  const response = await generateChat({
    engine: params.engine,
    model: params.model,
    messages: ctx.messages,
    options: ctx.ollamaParams
  });
  ctx.firstDraftPrompt = extractCodeBlock(response.message.content);
  ctx.finalPrompt = ctx.firstDraftPrompt;
}

async function criticPass(ctx: Ctx): Promise<void> {
  if (!ctx.willRunCritic) return;
  const { params } = ctx;
  ctx.onProgress?.(2, ctx.totalSteps, "Reviewing draft with critic pass...");

  const criticPrompt = CRITIC_SYSTEM_PROMPT
    .split("{{first_draft_prompt}}").join(ctx.firstDraftPrompt)
    .split("{{original_draft}}").join(params.draft);

  const response = await generateChat({
    engine: params.engine,
    model: params.model,
    messages: [
      { role: "system", content: criticPrompt },
      { role: "user", content: "Run the critique process and provide the final optimized prompt now." }
    ],
    options: ctx.ollamaParams
  });
  ctx.finalPrompt = extractCodeBlock(response.message.content);
}

// CoT and guardrails were kicked off in parallel with the first draft; here
// we await both and inject whatever they produced.
async function enhancementsPass(ctx: Ctx): Promise<void> {
  const [needsCoT, constraints] = await Promise.all([ctx.cotCheckPromise, ctx.guardrailsPromise]);
  if (needsCoT) {
    ctx.finalPrompt = injectCoT(ctx.finalPrompt, ctx.params.target_model);
  }
  if (constraints) {
    ctx.finalPrompt = injectGuardrails(ctx.finalPrompt, constraints);
  }
}

async function intentLinePass(ctx: Ctx): Promise<void> {
  if (ctx.intentPromise) {
    ctx.intentResult = await ctx.intentPromise;
  }
  const intentLine = ctx.intentResult ? buildIntentLine(ctx.intentResult) : null;
  if (intentLine) {
    ctx.finalPrompt = injectIntentLine(ctx.finalPrompt, intentLine, ctx.params.target_model);
  }
  if (ctx.autoEnabledBrainstorm) {
    ctx.intentNote = "Detected ideation draft; enabled brainstorm mode.";
  } else if (intentLine) {
    ctx.intentNote = `Detected intent: ${ctx.intentResult!.intent}; added a capability instruction.`;
  } else if (ctx.intentResult?.fallback) {
    const reason = ctx.intentResult.fallback === "classifier_error"
      ? "classifier call failed"
      : "classifier returned an unrecognized response";
    ctx.intentNote = `Intent classification fell back to self_contained (${reason}); no capability instruction added.`;
  }
}

async function lintAndRepairPass(ctx: Ctx): Promise<void> {
  const { params } = ctx;
  const expectedPlaceholder = ctx.intentResult?.intent === "user_artifact"
    ? `{{${ctx.intentResult.artifactName ?? "artifact"}}}`
    : undefined;

  const warnings = lintOptimizedPrompt(params.draft, ctx.effectiveContext, ctx.finalPrompt, expectedPlaceholder, params.glossary);
  const repairable = warnings.filter(w => w.repairable);
  if (params.auto_repair === false || repairable.length === 0) {
    ctx.lintWarnings = warnings;
    return;
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
      .split("{{prompt}}").join(ctx.finalPrompt)
      .split("{{issues}}").join(issues);
    const response = await generateChat({
      engine: params.engine,
      model: params.model,
      messages: [
        { role: "system", content: repairPrompt },
        { role: "user", content: "Output the corrected prompt now." }
      ],
      options: ctx.ollamaParams
    });
    const repaired = extractCodeBlock(response.message.content);
    const remaining = lintOptimizedPrompt(params.draft, ctx.effectiveContext, repaired, expectedPlaceholder, params.glossary);
    const remainingRepairableCount = remaining.filter(w => w.repairable).length;
    ctx.finalPrompt = repaired;
    ctx.lintWarnings = remaining;
    ctx.repairedCount = Math.max(0, repairable.length - remainingRepairableCount);
  } catch (error) {
    console.error("Repair pass failed, keeping pre-repair prompt:", error);
    ctx.lintWarnings = warnings;
  }
}

async function persistSessionPass(ctx: Ctx): Promise<void> {
  if (!ctx.params.session_id) return;
  ctx.messages.push({
    role: "assistant",
    content: `\`\`\`text\n${ctx.finalPrompt}\n\`\`\``
  });
  saveSession(ctx.params.session_id, ctx.messages);
}

async function explainPass(ctx: Ctx): Promise<string | undefined> {
  const { params } = ctx;
  if (!params.explain) return undefined;

  if (!ctx.willRunCritic) {
    return ctx.intentNote ? `${SKIP_CRITIC_EXPLANATION} ${ctx.intentNote}` : SKIP_CRITIC_EXPLANATION;
  }

  ctx.onProgress?.(3, ctx.totalSteps, "Generating change summary...");
  const summary = await runExplainCall(ctx.firstDraftPrompt, ctx.finalPrompt, params, ctx.ollamaParams);
  return ctx.intentNote ? `${summary} ${ctx.intentNote}` : summary;
}

const FRESH_DRAFT_PASSES: Array<(ctx: Ctx) => Promise<void>> = [
  firstDraftPass,
  criticPass,
  enhancementsPass,
  intentLinePass,
  lintAndRepairPass,
  persistSessionPass
];

async function optimizeFresh(ctx: Ctx): Promise<Result> {
  for (const pass of FRESH_DRAFT_PASSES) {
    await pass(ctx);
  }

  return {
    optimizedPrompt: ctx.finalPrompt,
    explanation: await explainPass(ctx),
    stats: ctx.params.show_stats
      ? formatStatsString(calculateStats(ctx.params.draft, ctx.finalPrompt))
      : undefined,
    intentResult: ctx.intentResult,
    diff: ctx.params.show_diff
      ? (ctx.willRunCritic ? diffLines(ctx.firstDraftPrompt, ctx.finalPrompt) : "(critic pass skipped — no diff available)")
      : undefined,
    lintWarnings: ctx.lintWarnings,
    repairedCount: ctx.repairedCount
  };
}

// Session flow: the draft is user feedback on the previous iteration, so it
// bypasses the fresh-draft pipeline and continues the saved conversation.
async function refineWithFeedback(
  session: { messages: ChatMessage[] },
  params: Params,
  effectiveContext: string | undefined,
  ollamaParams: Record<string, unknown>,
  onProgress?: ProgressCallback
): Promise<Result> {
  onProgress?.(1, params.explain ? 2 : 1, "Refining prompt based on feedback...");

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
    explanation = await runExplainCall(previousPrompt, newPrompt, params, ollamaParams);
  }

  return {
    optimizedPrompt: newPrompt,
    explanation,
    stats: params.show_stats ? formatStatsString(calculateStats(params.draft, newPrompt)) : undefined,
    diff: params.show_diff ? diffLines(previousPrompt, newPrompt) : undefined,
    lintWarnings: lintOptimizedPrompt(params.draft, effectiveContext, newPrompt, undefined, params.glossary),
    repairedCount: 0
  };
}

export async function generateOptimizedPrompt(params: Params, onProgress?: ProgressCallback): Promise<Result> {
  const session = params.session_id ? getSession(params.session_id) : undefined;

  const effectiveContext = [params.context, params.glossary ? formatGlossary(params.glossary) : undefined]
    .filter(Boolean).join("\n\n") || undefined;

  const ctx: Ctx = {
    params,
    onProgress,
    effectiveContext,
    brainstorm: params.brainstorm ?? false,
    autoEnabledBrainstorm: false,
    systemPrompt: "",
    ollamaParams: {},
    messages: [],
    willRunCritic: false,
    totalSteps: 0,
    cotCheckPromise: Promise.resolve(false),
    guardrailsPromise: Promise.resolve(null),
    firstDraftPrompt: "",
    finalPrompt: "",
    lintWarnings: [],
    repairedCount: 0
  };

  if (!session) {
    await classifyIntentPass(ctx);
  }

  const { systemPrompt, params: ollamaParams } = getMetaPromptConfig(params.target_model, ctx.brainstorm);
  ctx.systemPrompt = systemPrompt;
  ctx.ollamaParams = ollamaParams as Record<string, unknown>;

  if (session) {
    return refineWithFeedback(session, params, effectiveContext, ctx.ollamaParams, onProgress);
  }

  ctx.willRunCritic = !isTrivialDraft(params.draft, params.target_model, ctx.brainstorm);
  ctx.totalSteps = ctx.willRunCritic ? (params.explain ? 3 : 2) : (params.explain ? 1 : 0);

  // Kick off CoT/guardrails now so they run in parallel with the first draft.
  ctx.cotCheckPromise = params.auto_cot
    ? requiresCoT(params.draft, params.model, params.engine, ctx.ollamaParams)
    : Promise.resolve(false);
  ctx.guardrailsPromise = params.auto_guardrails
    ? generateNegativeConstraints(params.draft, params.model, params.engine, ctx.ollamaParams)
    : Promise.resolve(null);

  return optimizeFresh(ctx);
}
