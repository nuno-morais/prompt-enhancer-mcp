import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";

export async function scanProject(cwd: string): Promise<string | null> {
  let contextParts: string[] = [];

  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
      if (deps.length > 0) {
        contextParts.push(`Dependencies/Frameworks: ${deps.slice(0, 10).join(", ")}`);
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  try {
    const gitStatus = cp.execSync("git status -s", { cwd, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8" });
    const statusStr = gitStatus ? gitStatus.toString().trim() : "";
    if (statusStr) {
      contextParts.push(`Modified files:\n${statusStr}`);
    }
  } catch (e) {
    // Ignore git errors
  }

  if (contextParts.length === 0) return null;
  return `Project Context:\n${contextParts.join("\n\n")}`;
}
