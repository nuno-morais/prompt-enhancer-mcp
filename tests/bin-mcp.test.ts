import { describe, it, expect } from "vitest";
import { mergeOllamaHeaderFlags } from "../src/bin/ollama-flags.js";
import { parseOpts, buildArgs, buildProgram } from "../src/bin/mcp.js";

async function runCliCapturingArgs(flags: string[]) {
  const opts = parseOpts(["node", "mcp", ...flags]);
  const draft = opts.draft ?? "stdin-draft";
  return buildArgs(opts, draft);
}

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

describe("mcp CLI arg mapping", () => {
  it("passes auto_intent: false when --no-auto-intent is given", async () => {
    const args = await runCliCapturingArgs(["--draft", "x", "--no-auto-intent"]);
    expect(args.auto_intent).toBe(false);
  });

  it("passes auto_intent: true by default", async () => {
    const args = await runCliCapturingArgs(["--draft", "x"]);
    expect(args.auto_intent).toBe(true);
  });

  it("passes brainstorm: undefined when -b is absent (enables auto-brainstorm)", async () => {
    const args = await runCliCapturingArgs(["--draft", "x"]);
    expect(args.brainstorm).toBeUndefined();
  });

  it("passes brainstorm: true when -b is given", async () => {
    const args = await runCliCapturingArgs(["--draft", "x", "-b"]);
    expect(args.brainstorm).toBe(true);
  });
});

describe("mcp CLI subcommands", () => {
  it("registers a lint subcommand", () => {
    const program = buildProgram();
    expect(program.commands.map(c => c.name())).toContain("lint");
  });
});
