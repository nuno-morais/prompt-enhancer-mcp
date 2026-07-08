export type PromptFormat = "plain" | "xml" | "markdown" | "json";

// Splits a generated system prompt into labeled sections using common heading
// conventions (markdown headers, "Label:" lines) so it can be re-rendered in
// another format. Falls back to a single "body" section if no structure is found.
function splitSections(text: string): { label: string; content: string }[] {
  const lines = text.split("\n");
  const sections: { label: string; content: string }[] = [];
  let currentLabel = "body";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) sections.push({ label: currentLabel, content });
    buffer = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/) ?? line.match(/^([A-Z][A-Za-z /]{2,30}):\s*$/);
    if (headerMatch) {
      flush();
      currentLabel = headerMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections.length > 0 ? sections : [{ label: "body", content: text.trim() }];
}

export function convertFormat(text: string, format: PromptFormat): string {
  if (format === "plain") return text.trim();

  const sections = splitSections(text);

  if (format === "xml") {
    return sections.map(s => `<${s.label}>\n${s.content}\n</${s.label}>`).join("\n\n");
  }

  if (format === "markdown") {
    return sections.map(s => `## ${s.label.replace(/_/g, " ")}\n${s.content}`).join("\n\n");
  }

  // json
  const obj: Record<string, string> = {};
  for (const s of sections) obj[s.label] = s.content;
  return JSON.stringify(obj, null, 2);
}
