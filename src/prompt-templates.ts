import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolves to <package root>/prompts both when running from src/ (tests) and
// from dist/ (build output), since both live one level below the root.
const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

const cache = new Map<string, string>();

export function loadPromptTemplate(name: string): string {
  let template = cache.get(name);
  if (template === undefined) {
    template = readFileSync(join(PROMPTS_DIR, `${name}.txt`), "utf-8");
    cache.set(name, template);
  }
  return template;
}
