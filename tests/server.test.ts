import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { AddressInfo } from "net";
import type http from "http";
import * as toolHandler from "../src/tool-handler.js";

describe("server", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    const { createServer } = await import("../src/server.js");
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.restoreAllMocks();
  });

  it("GET /health returns status ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /optimize with a valid payload returns 200 and the tool result", async () => {
    vi.spyOn(toolHandler, "handleOptimizePrompt").mockResolvedValue({
      content: [{ type: "text", text: "optimized!" }]
    });

    const res = await fetch(`${baseUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: "a draft" })
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: [{ type: "text", text: "optimized!" }] });
  });

  it("POST /optimize with a missing draft returns 400", async () => {
    const res = await fetch(`${baseUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request payload: 'draft' is required" });
  });

  it("POST /optimize with a non-string draft returns 400", async () => {
    const res = await fetch(`${baseUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: 123 })
    });

    expect(res.status).toBe(400);
  });

  it("POST /optimize with malformed JSON returns 500", async () => {
    const res = await fetch(`${baseUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json"
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal optimisation error" });
  });

  it("returns 404 for an unknown route", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for GET /optimize (wrong method)", async () => {
    const res = await fetch(`${baseUrl}/optimize`);
    expect(res.status).toBe(404);
  });
});
