import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkill } from "../src/bin/skills-install.js";

describe("installSkill", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs to the home-scoped path by default", () => {
    const home = mkdtempSync(join(tmpdir(), "skills-install-home-"));
    tempDirs.push(home);

    const dest = installSkill({ home });

    expect(dest).toBe(join(home, ".claude", "skills", "draft-prompt", "SKILL.md"));
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toContain("# draft-prompt");
  });

  it("installs to the project-scoped path with --project", () => {
    const cwd = mkdtempSync(join(tmpdir(), "skills-install-project-"));
    tempDirs.push(cwd);

    const dest = installSkill({ project: true, cwd });

    expect(dest).toBe(join(cwd, ".claude", "skills", "draft-prompt", "SKILL.md"));
    expect(existsSync(dest)).toBe(true);
  });

  it("is idempotent — re-running overwrites without error", () => {
    const home = mkdtempSync(join(tmpdir(), "skills-install-idem-"));
    tempDirs.push(home);

    const first = installSkill({ home });
    const second = installSkill({ home });

    expect(second).toBe(first);
    expect(readFileSync(second, "utf8")).toContain("# draft-prompt");
  });
});
