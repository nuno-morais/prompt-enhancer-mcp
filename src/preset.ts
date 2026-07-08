import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TargetModel } from "./config.js";
import type { LLMEngine } from "./llm.js";

export type Preset = {
  engine?: LLMEngine;
  target_model?: TargetModel;
  model?: string;
  brainstorm?: boolean;
  explain?: boolean;
  show_stats?: boolean;
  show_diff?: boolean;
  auto_intent?: boolean;
  glossary?: Record<string, string>;
  auto_repair?: boolean;
};

const VALID_TARGET_MODELS: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];
const VALID_ENGINES: LLMEngine[] = ["ollama", "anthropic", "sampling"];

function findPresetPath(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, ".prompt-enhancer.json");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function loadPreset(startDir: string = process.cwd()): Preset {
  const presetPath = findPresetPath(startDir);
  if (!presetPath) {
    return {};
  }

  const raw = readFileSync(presetPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in .prompt-enhancer.json: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(".prompt-enhancer.json must contain a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const preset: Preset = {};

  if (typeof obj.engine === "string" && VALID_ENGINES.includes(obj.engine as LLMEngine)) {
    preset.engine = obj.engine as LLMEngine;
  }
  if (typeof obj.target_model === "string" && VALID_TARGET_MODELS.includes(obj.target_model as TargetModel)) {
    preset.target_model = obj.target_model as TargetModel;
  }
  if (typeof obj.model === "string") {
    preset.model = obj.model;
  }
  if (typeof obj.brainstorm === "boolean") {
    preset.brainstorm = obj.brainstorm;
  }
  if (typeof obj.explain === "boolean") {
    preset.explain = obj.explain;
  }
  if (typeof obj.show_stats === "boolean") {
    preset.show_stats = obj.show_stats;
  }
  if (typeof obj.show_diff === "boolean") {
    preset.show_diff = obj.show_diff;
  }
  if (typeof obj.auto_intent === "boolean") {
    preset.auto_intent = obj.auto_intent;
  }
  if (typeof obj.auto_repair === "boolean") {
    preset.auto_repair = obj.auto_repair;
  }

  if (typeof obj.glossary === "object" && obj.glossary !== null && !Array.isArray(obj.glossary)) {
    const entries = Object.entries(obj.glossary as Record<string, unknown>)
      .filter((e): e is [string, string] => typeof e[1] === "string");
    if (entries.length > 0) preset.glossary = Object.fromEntries(entries);
  }

  return preset;
}

export function formatGlossary(glossary: Record<string, string>): string {
  const lines = Object.entries(glossary).map(([term, meaning]) => `${term} = ${meaning}`);
  return `Glossary (authoritative term meanings):\n${lines.join("\n")}`;
}
