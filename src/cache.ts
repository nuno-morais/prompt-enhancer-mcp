import { createHash } from "node:crypto";
import type { TargetModel } from "./config.js";

export type CachedResult = {
  content: Array<{ type: "text"; text: string }>;
};

type CacheEntry = {
  value: CachedResult;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const cache = new Map<string, CacheEntry>();

export function getCacheKey(params: {
  draft: string;
  context?: string;
  target_model: TargetModel;
  brainstorm: boolean;
  explain: boolean;
  model: string;
}): string {
  const raw = JSON.stringify({
    draft: params.draft,
    context: params.context ?? null,
    target_model: params.target_model,
    brainstorm: params.brainstorm,
    explain: params.explain,
    model: params.model
  });
  return createHash("sha256").update(raw).digest("hex");
}

export function getCached(key: string): CachedResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function setCached(key: string, value: CachedResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}
