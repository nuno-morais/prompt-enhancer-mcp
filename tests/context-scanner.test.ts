import { describe, it, expect, vi, beforeEach } from "vitest";
import * as util from "util";
import * as path from "path";

// Define the mock behavior variables that we can change in tests
let mockExecResponse: any = { stdout: " M src/index.ts\n", stderr: "" };
let mockExecError: any = null;

vi.mock("child_process", () => {
  const execMock = vi.fn();
  // Set the custom promisify symbol so util.promisify picks it up correctly
  (execMock as any)[util.promisify.custom] = vi.fn().mockImplementation(async () => {
    if (mockExecError) throw mockExecError;
    return mockExecResponse;
  });
  return { exec: execMock };
});

vi.mock("fs/promises");

import { scanProject } from "../src/context-scanner.js";
import * as fs from "fs/promises";
import * as cp from "child_process";

describe("scanProject", () => {
  beforeEach(() => {
    mockExecResponse = { stdout: " M src/index.ts\n", stderr: "" };
    mockExecError = null;
    vi.clearAllMocks();
  });

  it("gathers framework and git status", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    
    const result = await scanProject("/fake/cwd");
    expect(result).toContain("react");
    expect(result).toContain("src/index.ts");

    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(path.join("/fake/cwd", "package.json"), "utf-8");
    expect((cp.exec as any)[util.promisify.custom]).toHaveBeenCalledWith("git status -s", expect.objectContaining({ cwd: "/fake/cwd" }));
  });
  
  it("returns null if not in a node/git project or on error", async () => {
    vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
    mockExecError = new Error("not a git repo");
    
    const result = await scanProject("/fake/cwd");
    expect(result).toBeNull();
  });
});
