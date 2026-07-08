import { describe, it, expect, vi } from "vitest";
import { scanProject } from "../src/context-scanner.js";
import * as fs from "fs";
import * as cp from "child_process";
import * as path from "path";

vi.mock("fs");
vi.mock("child_process");

describe("scanProject", () => {
  it("gathers framework and git status", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    vi.mocked(cp.execSync).mockReturnValue(Buffer.from(" M src/index.ts\n"));
    
    const result = await scanProject("/fake/cwd");
    expect(result).toContain("react");
    expect(result).toContain("src/index.ts");
  });
  
  it("returns null if not in a node/git project or on error", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(cp.execSync).mockImplementation(() => { throw new Error("not a git repo"); });
    const result = await scanProject("/fake/cwd");
    expect(result).toBeNull();
  });
});
