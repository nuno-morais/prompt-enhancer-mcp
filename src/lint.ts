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

  return warnings;
}
