import { describe, it, expect, beforeEach } from "vitest";
import { registerSamplingServer, samplingAvailable, samplingChat, SAMPLING_UNSUPPORTED_MESSAGE, _resetForTests } from "../src/sampling-client.js";

const req = { engine: "sampling" as const, model: "any", messages: [
  { role: "system" as const, content: "be brief" },
  { role: "user" as const, content: "hi" }
], options: {} };

describe("sampling client", () => {
  beforeEach(() => _resetForTests());

  it("is unavailable with no registered server (CLI case)", () => {
    expect(samplingAvailable()).toBe(false);
  });

  it("throws the exact spec message when the client lacks the capability", async () => {
    registerSamplingServer({ getClientCapabilities: () => ({}), createMessage: async () => ({ content: { type: "text", text: "x" } }) });
    await expect(samplingChat(req)).rejects.toThrow(SAMPLING_UNSUPPORTED_MESSAGE);
  });

  it("maps messages: system prompt to systemPrompt, rest to sampling messages, model to a hint", async () => {
    let captured: any;
    registerSamplingServer({
      getClientCapabilities: () => ({ sampling: {} }),
      createMessage: async (p) => { captured = p; return { content: { type: "text", text: "hello" }, model: "client-model" }; }
    });
    const res = await samplingChat(req);
    expect(captured.systemPrompt).toBe("be brief");
    expect(captured.messages).toEqual([{ role: "user", content: { type: "text", text: "hi" } }]);
    expect(captured.modelPreferences).toEqual({ hints: [{ name: "any" }] });
    expect(res.message.content).toBe("hello");
  });

  it("throws on a non-text sampling response", async () => {
    registerSamplingServer({ getClientCapabilities: () => ({ sampling: {} }), createMessage: async () => ({ content: { type: "image" } }) });
    await expect(samplingChat(req)).rejects.toThrow(/text/);
  });
});
