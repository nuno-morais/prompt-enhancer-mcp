import * as fs from "fs/promises";
import * as path from "path";
import * as cp from "child_process";
import * as util from "util";

const execAsync = util.promisify(cp.exec);

export async function scanProject(cwd: string): Promise<string | null> {
  const contextParts: string[] = [];

  const pkgPath = path.join(cwd, "package.json");
  try {
    const pkgRaw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);
    const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    if (deps.length > 0) {
      contextParts.push(`Dependencies/Frameworks: ${deps.slice(0, 10).join(", ")}`);
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      console.error(e);
    }
    // Ignore ENOENT and parsing errors
  }

  try {
    const { stdout } = await execAsync("git status -s", { cwd, encoding: "utf-8" });
    const statusStr = stdout ? stdout.trim() : "";
    if (statusStr) {
      contextParts.push(`Modified files:\n${statusStr}`);
    }
  } catch (e: any) {
    const isGitRepoError = e.status === 128 || (e.message && e.message.includes('not a git repo'));
    if (!isGitRepoError) {
      console.error(e);
    }
    // Ignore git status errors
  }

  if (contextParts.length === 0) return null;
  return `Project Context:\n${contextParts.join("\n\n")}`;
}
