import { encode } from "gpt-tokenizer";

export interface PromptStats {
  originalTokens: number;
  optimizedTokens: number;
  tokenDifference: number;
  expansionMultiplier: string;
}

export function calculateStats(originalDraft: string, optimizedPrompt: string): PromptStats {
  const originalTokens = encode(originalDraft).length;
  // If the user just gave 1 word, handle edge cases
  const safeOriginalTokens = Math.max(1, originalTokens);
  
  const optimizedTokens = encode(optimizedPrompt).length;
  
  const tokenDifference = optimizedTokens - originalTokens;
  const expansionMultiplier = (optimizedTokens / safeOriginalTokens).toFixed(1);

  return {
    originalTokens,
    optimizedTokens,
    tokenDifference,
    expansionMultiplier
  };
}

export function formatStatsString(stats: PromptStats): string {
  return `📊 **Prompt Stats & Efficiency:**
- **Tokens (Before):** ${stats.originalTokens}
- **Tokens (After):** ${stats.optimizedTokens}
- **Context Expansion:** ${stats.expansionMultiplier}x (A denser prompt saves the paid API's reasoning cycles)
- **Additional Input Cost:** ~${stats.tokenDifference} tokens (negligible compared to the savings from a correct output on the paid API).`;
}
