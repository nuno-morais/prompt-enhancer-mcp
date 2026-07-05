import { describe, it, expect } from "vitest";
import { calculateStats, formatStatsString } from "../src/stats.js";

describe("stats", () => {
  it("calculates stats correctly", () => {
    // short draft
    const original = "write a poem";
    // longer optimized prompt
    const optimized = "Write a poem about the sea, with 3 stanzas, a rhyming scheme of AABB, and a melancholy tone.";
    
    const stats = calculateStats(original, optimized);
    
    expect(stats.originalTokens).toBeGreaterThan(0);
    expect(stats.optimizedTokens).toBeGreaterThan(stats.originalTokens);
    expect(stats.tokenDifference).toBe(stats.optimizedTokens - stats.originalTokens);
    expect(parseFloat(stats.expansionMultiplier)).toBeGreaterThan(1);
  });

  it("handles empty or very short original draft safely", () => {
    const stats = calculateStats("", "optimized prompt");
    expect(stats.originalTokens).toBe(0);
    // Should not return Infinity or NaN
    expect(stats.expansionMultiplier).toBe((stats.optimizedTokens / 1).toFixed(1));
  });

  it("formats stats string correctly", () => {
    const stats = {
      originalTokens: 10,
      optimizedTokens: 50,
      tokenDifference: 40,
      expansionMultiplier: "5.0"
    };

    const formatted = formatStatsString(stats);
    expect(formatted).toContain("Tokens (Antes):** 10");
    expect(formatted).toContain("Tokens (Depois):** 50");
    expect(formatted).toContain("Expansão de Contexto:** 5.0x");
    expect(formatted).toContain("Custo Adicional de Input:** ~40 tokens");
  });
});
