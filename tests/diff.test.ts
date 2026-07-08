import { describe, it, expect } from "vitest";
import { diffLines } from "../src/diff.js";

describe("diffLines", () => {
  it("returns '(no changes)' for identical inputs", () => {
    expect(diffLines("a\nb", "a\nb")).toBe("(no changes)");
  });

  it("marks added lines with '+ '", () => {
    expect(diffLines("a", "a\nb")).toBe("  a\n+ b");
  });

  it("marks removed lines with '- '", () => {
    expect(diffLines("a\nb", "a")).toBe("  a\n- b");
  });

  it("shows a replacement as remove-then-add", () => {
    const out = diffLines("<task>Do X</task>", "<task>Do X precisely</task>");
    expect(out).toBe("- <task>Do X</task>\n+ <task>Do X precisely</task>");
  });

  it("keeps common context lines around a change", () => {
    const before = "line1\nline2\nline3";
    const after = "line1\nline2 changed\nline3";
    expect(diffLines(before, after)).toBe("  line1\n- line2\n+ line2 changed\n  line3");
  });
});
