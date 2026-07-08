import * as fs from "fs/promises";
import * as path from "path";
import * as cp from "child_process";
import * as util from "util";

const execAsync = util.promisify(cp.exec);

export async function scanProject(cwd: string): Promise<string | null> {
  let contextParts: string[] = [];

  try {
    const pkgPath = path.join(cwd, "package.json");
    try {
      await fs.access(pkgPath);
      const pkgRaw = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgRaw);
      const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
      if (deps.length > 0) {
        contextParts.push(`Dependencies/Frameworks: ${deps.slice(0, 10).join(", ")}`);
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        console.warn(`Error reading or parsing package.json: ${e.message}`);
      }
    }
  } catch (e: any) {
    console.warn(`Unexpected error processing package.json: ${e.message}`);
  }

  try {
    const { stdout } = await execAsync("git status -s", { cwd, encoding: "utf-8" });
    const statusStr = stdout ? stdout.trim() : "";
    if (statusStr) {
      contextParts.push(`Modified files:\n${statusStr}`);
    }
  } catch (e: any) {
    if (!e.message.includes("not a git repository") && !e.message.includes("not a git repo")) {
      console.warn(`Git status error: ${e.message}`);
    }
  }

  if (contextParts.length === 0) return null;
  return `Project Context:\n${contextParts.join("\n\n")}`;
}
