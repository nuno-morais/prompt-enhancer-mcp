// src/lint.ts
export type LintKind = "unresolved_placeholder" | "dropped_placeholder" | "suspect_expansion" | "meta_commentary";
export type LintWarning = { message: string; kind: LintKind; repairable: boolean };

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
  optimizedPrompt: string,
  expectedPlaceholder?: string,
  glossary?: Record<string, string>
): LintWarning[] {
  const warnings: LintWarning[] = [];

  const placeholders = [...new Set(optimizedPrompt.match(/\{\{[a-zA-Z0-9_]+\}\}/g) ?? [])]
    .filter(p => p !== expectedPlaceholder);
  if (placeholders.length > 0) {
    warnings.push({
      message: `Unresolved placeholder(s) ${placeholders.join(", ")} — fill these in before using the prompt.`,
      kind: "unresolved_placeholder",
      repairable: false
    });
  }

  if (expectedPlaceholder && !optimizedPrompt.includes(expectedPlaceholder)) {
    warnings.push({
      message: `The intent classifier asked for ${expectedPlaceholder}, but it was dropped from the final prompt — the artifact request may be missing.`,
      kind: "dropped_placeholder",
      repairable: false
    });
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

    // Check if glossary has this acronym and matches the expansion (case-insensitive)
    const glossaryExpansion = glossary?.[acronym];
    if (glossaryExpansion && expansion.toLowerCase() === glossaryExpansion.toLowerCase()) {
      continue;
    }

    if (draftHasAcronym && !expansionSupported) {
      warnings.push({
        message: `The prompt expands "${acronym}" as "${expansion}", but that expansion appears in neither the draft nor the context — verify it is correct.`,
        kind: "suspect_expansion",
        repairable: Boolean(glossaryExpansion)
      });
    }
  }

  if (META_COMMENTARY_PATTERNS.some(p => p.test(optimizedPrompt.trimStart()))) {
    warnings.push({
      message: "The prompt starts with meta-commentary (e.g. \"Here is…\") that leaked from the rewriting model — remove it before use.",
      kind: "meta_commentary",
      repairable: true
    });
  }

  return warnings;
}
