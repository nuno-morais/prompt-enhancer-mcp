import { describe, it, expect } from "vitest";
import { mergeOllamaHeaderFlags } from "../src/bin/ollama-flags.js";

describe("mergeOllamaHeaderFlags", () => {
  it("returns a JSON string of just the CLI headers when no existing env headers are set", () => {
    const result = mergeOllamaHeaderFlags(undefined, { "X-Foo": "bar" });
    expect(JSON.parse(result)).toEqual({ "X-Foo": "bar" });
  });

  it("merges CLI headers on top of existing env headers", () => {
    const existing = '{"X-Foo":"old","X-Keep":"yes"}';
    const result = mergeOllamaHeaderFlags(existing, { "X-Foo": "new" });
    expect(JSON.parse(result)).toEqual({ "X-Foo": "new", "X-Keep": "yes" });
  });

  it("returns just the existing headers unchanged when no CLI headers are given", () => {
    const existing = '{"X-Foo":"old"}';
    const result = mergeOllamaHeaderFlags(existing, {});
    expect(JSON.parse(result)).toEqual({ "X-Foo": "old" });
  });
});
