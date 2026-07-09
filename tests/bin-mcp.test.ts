import { describe, it, expect, vi } from "vitest";
import { mergeOllamaHeaderFlags } from "../src/bin/ollama-flags.js";
import { parseOpts, buildArgs, buildProgram } from "../src/bin/mcp.js";
import { installSkill } from "../src/bin/skills-install.js";

vi.mock("../src/bin/skills-install.js", () => ({
  installSkill: vi.fn(() => "/fake/dest/SKILL.md"),
}));

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

  it("passes auto_repair: true by default", async () => {
    const args = await runCliCapturingArgs(["--draft", "x"]);
    expect(args.auto_repair).toBe(true);
  });

  it("passes auto_repair: false when --no-auto-repair is given", async () => {
    const args = await runCliCapturingArgs(["--draft", "x", "--no-auto-repair"]);
    expect(args.auto_repair).toBe(false);
  });
});

describe("mcp CLI subcommands", () => {
  it("registers a lint subcommand", () => {
    const program = buildProgram();
    expect(program.commands.map(c => c.name())).toContain("lint");
  });

  it("dispatches lint subcommand --draft flag correctly through parseAsync", async () => {
    const program = buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    try {
      await program.parseAsync(
        ["node", "mcp", "lint", "Summarize the text in 3 sentences.", "--draft", "summarize"]
      );
    } catch (e: any) {
      // process.exit throws, which is expected
      if (e.message !== "exit") throw e;
    }

    // Verify console.log was called (lint command executed)
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0]?.[0] ?? "";

    // Verify --draft was received correctly by the lint subcommand:
    // When draft IS provided, there should be no "draft not provided" note.
    // A clean prompt with draft should output "No lint issues found."
    expect(output).toBe("No lint issues found.");
    expect(output).not.toContain("draft not provided");

    // Verify process.exit(0) was called (no lint issues = exit 0)
    expect(exitSpy).toHaveBeenCalledWith(0);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("mcp skills install", () => {
  it("registers a skills command with an install subcommand", () => {
    const program = buildProgram();
    const skills = program.commands.find((c) => c.name() === "skills");
    expect(skills).toBeDefined();
    const install = skills!.commands.find((c) => c.name() === "install");
    expect(install).toBeDefined();
  });

  it("calls installSkill with project: true when --project is passed", async () => {
    const program = buildProgram();
    await program.parseAsync(["node", "mcp", "skills", "install", "--project"]);
    expect(installSkill).toHaveBeenCalledWith({ project: true });
  });

  it("calls installSkill with project: undefined when --project is omitted", async () => {
    const program = buildProgram();
    await program.parseAsync(["node", "mcp", "skills", "install"]);
    expect(installSkill).toHaveBeenCalledWith({ project: undefined });
  });
});
