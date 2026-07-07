// src/lint.ts
const META_COMMENTARY_PATTERNS = [
  /^here is /i,
  /^here's /i,
  /^sure[,!]/i,
  /^i hope this helps/im,
  /^as requested/i
];

export function lintOptimizedPrompt(
  draft: string,
  context: string | undefined,
  optimizedPrompt: string
): string[] {
  const warnings: string[] = [];

  const placeholders = [...new Set(optimizedPrompt.match(/\{\{[a-zA-Z0-9_]+\}\}/g) ?? [])];
  if (placeholders.length > 0) {
    warnings.push(
      `Unresolved placeholder(s) ${placeholders.join(", ")} — fill these in before using the prompt.`
    );
  }

  // Acronym expansions: "XYZ (Some Expansion Words)" in output where the
  // acronym is in the draft but the expansion appears in neither draft nor context.
  const source = `${draft}\n${context ?? ""}`.toLowerCase();
  const expansionMatches = optimizedPrompt.matchAll(/\b([A-Z]{2,6})\s*\(([^)]{4,60})\)/g);
  for (const match of expansionMatches) {
    const acronym = match[1];
    const expansion = match[2].trim();
    const draftHasAcronym = new RegExp(`\\b${acronym}\\b`, "i").test(draft);
    const expansionSupported = source.includes(expansion.toLowerCase());
    if (draftHasAcronym && !expansionSupported) {
      warnings.push(
        `The prompt expands "${acronym}" as "${expansion}", but that expansion appears in neither the draft nor the context — verify it is correct.`
      );
    }
  }

  if (META_COMMENTARY_PATTERNS.some(p => p.test(optimizedPrompt.trimStart()))) {
    warnings.push(
      "The prompt starts with meta-commentary (e.g. \"Here is…\") that leaked from the rewriting model — remove it before use."
    );
  }

  return warnings;
}
