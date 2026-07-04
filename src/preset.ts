import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TargetModel } from "./config.js";

export type Preset = {
  target_model?: TargetModel;
  model?: string;
  brainstorm?: boolean;
  explain?: boolean;
};

const VALID_TARGET_MODELS: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];

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

  return preset;
}
