import type { OllamaChatMessage } from "./ollama-client.js";

type SessionData = {
  messages: OllamaChatMessage[];
  lastUpdated: number;
};

// Simple in-memory map for session storage
const sessions = new Map<string, SessionData>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function getSession(id: string): SessionData | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  if (Date.now() - session.lastUpdated > SESSION_TTL_MS) {
    sessions.delete(id);
    return undefined;
  }

  // Update TTL
  session.lastUpdated = Date.now();
  return session;
}

export function saveSession(id: string, messages: OllamaChatMessage[]) {
  sessions.set(id, {
    messages,
    lastUpdated: Date.now()
  });
}
