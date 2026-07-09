import { mkdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface InstallSkillOptions {
  /** Install into ./.claude/skills instead of the user home directory. */
  project?: boolean;
  /** Test-only override for process.cwd(). */
  cwd?: string;
  /** Test-only override for os.homedir(). */
  home?: string;
}

/**
 * Copies the bundled draft-prompt SKILL.md to the target skills directory.
 * Returns the absolute destination path.
 */
export function installSkill(opts: InstallSkillOptions = {}): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // here is src/bin (source) or dist/bin (compiled); package root is two levels up either way.
  const sourcePath = join(here, "..", "..", "skills", "draft-prompt", "SKILL.md");

  const baseDir = opts.project
    ? join(opts.cwd ?? process.cwd(), ".claude", "skills", "draft-prompt")
    : join(opts.home ?? homedir(), ".claude", "skills", "draft-prompt");

  mkdirSync(baseDir, { recursive: true });
  const destPath = join(baseDir, "SKILL.md");
  copyFileSync(sourcePath, destPath);
  return destPath;
}
