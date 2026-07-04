export function extractCodeBlock(text: string): string {
  const match = text.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  if (match) {
    return match[1];
  }

  const openOnly = text.match(/^```[a-zA-Z]*\n([\s\S]*)$/);
  if (openOnly) {
    return openOnly[1].replace(/```$/, "").trim();
  }

  return text.trim();
}
