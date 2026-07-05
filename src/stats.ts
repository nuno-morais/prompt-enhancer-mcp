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
- **Tokens (Antes):** ${stats.originalTokens}
- **Tokens (Depois):** ${stats.optimizedTokens}
- **Expansão de Contexto:** ${stats.expansionMultiplier}x (Um prompt mais denso poupa ciclos de raciocínio da IA)
- **Custo Adicional de Input:** ~${stats.tokenDifference} tokens (irrelevante face à poupança no output correto da API paga).`;
}
