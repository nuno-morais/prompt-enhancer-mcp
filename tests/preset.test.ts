import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPreset } from "../src/preset.js";
import type { TargetModel } from "../src/config.js";

describe("loadPreset", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns an empty object when no .prompt-enhancer.json exists anywhere up to the filesystem root", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    expect(loadPreset(tempDir)).toEqual({});
  });

  it("reads target_model, model, brainstorm, and explain from a valid preset file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(
      join(tempDir, ".prompt-enhancer.json"),
      JSON.stringify({ target_model: "claude", model: "custom-model", brainstorm: true, explain: true })
    );

    expect(loadPreset(tempDir)).toEqual({
      target_model: "claude",
      model: "custom-model",
      brainstorm: true,
      explain: true
    });
  });

  it("finds the preset file by walking up from a nested subdirectory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(join(tempDir, ".prompt-enhancer.json"), JSON.stringify({ target_model: "gpt4o" }));

    const nestedDir = join(tempDir, "src", "nested");
    mkdirSync(nestedDir, { recursive: true });

    expect(loadPreset(nestedDir)).toEqual({ target_model: "gpt4o" });
  });

  it("throws a descriptive error when the file contains invalid JSON", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(join(tempDir, ".prompt-enhancer.json"), "{ not valid json");

    expect(() => loadPreset(tempDir)).toThrow("Invalid JSON in .prompt-enhancer.json");
  });

  it("throws when the file's top-level JSON value is not an object", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(join(tempDir, ".prompt-enhancer.json"), JSON.stringify(["not", "an", "object"]));

    expect(() => loadPreset(tempDir)).toThrow(".prompt-enhancer.json must contain a JSON object");
  });

  it("silently ignores an invalid target_model value", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(join(tempDir, ".prompt-enhancer.json"), JSON.stringify({ target_model: "not-a-real-model" }));

    expect(loadPreset(tempDir)).toEqual({});
  });

  it("silently ignores unrecognized fields while keeping recognized ones", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(
      join(tempDir, ".prompt-enhancer.json"),
      JSON.stringify({ target_model: "claude", some_typo_field: "ignored" })
    );

    expect(loadPreset(tempDir)).toEqual({ target_model: "claude" });
  });

  it("loads auto_intent from the preset file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    writeFileSync(join(tempDir, ".prompt-enhancer.json"), JSON.stringify({ auto_intent: false }));

    expect(loadPreset(tempDir).auto_intent).toBe(false);
  });

  it("accepts every current TargetModel value in a preset file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preset-test-"));
    const targetModels: TargetModel[] = ["generic", "claude", "gpt4o", "gemini"];

    for (const targetModel of targetModels) {
      writeFileSync(join(tempDir, ".prompt-enhancer.json"), JSON.stringify({ target_model: targetModel }));
      expect(loadPreset(tempDir)).toEqual({ target_model: targetModel });
    }
  });
});
