import { describe, it, expect, vi, afterEach } from "vitest";
import { getSession, saveSession } from "../src/session.js";

describe("session", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for an unknown session id", () => {
    expect(getSession("does-not-exist")).toBeUndefined();
  });

  it("returns saved messages for a live session", () => {
    const id = `session-${Math.random()}`;
    const messages = [{ role: "user" as const, content: "hello" }];

    saveSession(id, messages);
    const result = getSession(id);

    expect(result?.messages).toEqual(messages);
  });

  it("overwrites an existing session's messages on re-save", () => {
    const id = `session-${Math.random()}`;
    saveSession(id, [{ role: "user" as const, content: "first" }]);
    saveSession(id, [{ role: "user" as const, content: "second" }]);

    const result = getSession(id);

    expect(result?.messages).toEqual([{ role: "user", content: "second" }]);
  });

  it("refreshes lastUpdated on read", () => {
    vi.useFakeTimers();
    const id = `session-${Math.random()}`;
    vi.setSystemTime(0);
    saveSession(id, [{ role: "user" as const, content: "hi" }]);

    vi.setSystemTime(60_000); // 1 minute later
    const firstRead = getSession(id);
    expect(firstRead?.lastUpdated).toBe(60_000);
  });

  it("returns undefined and evicts the entry once the 2-hour TTL has elapsed", () => {
    vi.useFakeTimers();
    const id = `session-${Math.random()}`;
    vi.setSystemTime(0);
    saveSession(id, [{ role: "user" as const, content: "hi" }]);

    vi.setSystemTime(2 * 60 * 60 * 1000 + 1); // TTL + 1ms
    expect(getSession(id)).toBeUndefined();

    // Confirm eviction: even resetting time back within TTL of the *original*
    // save should not resurrect it, since the entry was deleted.
    vi.setSystemTime(60_000);
    expect(getSession(id)).toBeUndefined();
  });
});
