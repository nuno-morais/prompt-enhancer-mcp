import { describe, it, expect, vi, afterEach } from "vitest";
import { getCacheKey, getCached, setCached, type CachedResult } from "../src/cache.js";

describe("getCacheKey", () => {
  const baseParams = {
    draft: "summarize this",
    target_model: "generic" as const,
    brainstorm: false,
    explain: false,
    model: "test-model",
    auto_intent: true
  };

  it("is deterministic for identical params", () => {
    expect(getCacheKey(baseParams)).toBe(getCacheKey({ ...baseParams }));
  });

  it("changes when draft changes", () => {
    expect(getCacheKey(baseParams)).not.toBe(getCacheKey({ ...baseParams, draft: "different draft" }));
  });

  it("changes when target_model changes", () => {
    expect(getCacheKey(baseParams)).not.toBe(getCacheKey({ ...baseParams, target_model: "claude" }));
  });

  it("changes when brainstorm changes", () => {
    expect(getCacheKey(baseParams)).not.toBe(getCacheKey({ ...baseParams, brainstorm: true }));
  });

  it("changes when explain changes", () => {
    expect(getCacheKey(baseParams)).not.toBe(getCacheKey({ ...baseParams, explain: true }));
  });

  it("changes when model changes", () => {
    expect(getCacheKey(baseParams)).not.toBe(getCacheKey({ ...baseParams, model: "other-model" }));
  });

  it("changes when context changes", () => {
    expect(getCacheKey(baseParams)).not.toBe(
      getCacheKey({ ...baseParams, context: "MCP = Model Context Protocol" })
    );
  });

  it("treats undefined context and absent context as the same key", () => {
    expect(getCacheKey(baseParams)).toBe(getCacheKey({ ...baseParams, context: undefined }));
  });
});

describe("getCacheKey with auto_intent", () => {
  const base = {
    draft: "d",
    target_model: "generic" as const,
    brainstorm: false as boolean | null,
    explain: false,
    model: "m"
  };

  it("differs when auto_intent differs", () => {
    expect(getCacheKey({ ...base, auto_intent: true }))
      .not.toBe(getCacheKey({ ...base, auto_intent: false }));
  });

  it("differs between explicit brainstorm false and unset (null)", () => {
    expect(getCacheKey({ ...base, auto_intent: true }))
      .not.toBe(getCacheKey({ ...base, brainstorm: null, auto_intent: true }));
  });
});

describe("getCached / setCached", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a stored value", () => {
    const value: CachedResult = { content: [{ type: "text", text: "hello" }] };
    setCached("key-1", value);
    expect(getCached("key-1")).toEqual(value);
  });

  it("returns undefined for a key that was never set", () => {
    expect(getCached("never-set-key")).toBeUndefined();
  });

  it("expires an entry after the 1-hour TTL", () => {
    vi.useFakeTimers();
    const value: CachedResult = { content: [{ type: "text", text: "expiring" }] };
    setCached("key-ttl", value);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(getCached("key-ttl")).toBeUndefined();
  });

  it("evicts the oldest untouched entry once the cache exceeds 100 entries", () => {
    for (let i = 0; i < 100; i++) {
      setCached(`bulk-${i}`, { content: [{ type: "text", text: `value-${i}` }] });
    }
    // "bulk-0" is now the oldest entry.
    setCached("bulk-100", { content: [{ type: "text", text: "value-100" }] });

    expect(getCached("bulk-0")).toBeUndefined();
    expect(getCached("bulk-100")).toEqual({ content: [{ type: "text", text: "value-100" }] });
  });

  it("protects a recently-read entry from eviction", () => {
    for (let i = 0; i < 100; i++) {
      setCached(`lru-${i}`, { content: [{ type: "text", text: `value-${i}` }] });
    }
    // Touch "lru-0" so it's no longer the least-recently-used entry.
    getCached("lru-0");

    setCached("lru-100", { content: [{ type: "text", text: "value-100" }] });

    expect(getCached("lru-0")).toEqual({ content: [{ type: "text", text: "value-0" }] });
    // "lru-1" is now the oldest untouched entry and should have been evicted instead.
    expect(getCached("lru-1")).toBeUndefined();
  });
});
