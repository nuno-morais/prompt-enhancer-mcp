import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
import { handleCheckHealth } from "../src/health.js";

describe("handleCheckHealth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports Anthropic configured when ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");

    const result = await handleCheckHealth({ engine: "anthropic" });

    expect(result.content).toEqual([
      { type: "text", text: "✅ Anthropic engine configured (ANTHROPIC_API_KEY is set)." }
    ]);
  });

  it("reports Anthropic not configured when ANTHROPIC_API_KEY is unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    delete process.env.ANTHROPIC_API_KEY;

    const result = await handleCheckHealth({ engine: "anthropic" });

    expect(result.content).toEqual([
      { type: "text", text: "❌ Anthropic engine not configured: ANTHROPIC_API_KEY environment variable is not set." }
    ]);
  });
});
