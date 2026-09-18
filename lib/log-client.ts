"use client";

/**
 * Browser-side logging. Deliberately thin: it keeps a short in-memory ring buffer so a
 * flatmate can tell you what happened before something broke, and mirrors to the
 * console in development. Nothing is sent anywhere.
 */
type Entry = { at: string; level: "info" | "warn" | "error"; message: string; detail?: unknown };

const BUFFER_SIZE = 50;
const buffer: Entry[] = [];

function record(level: Entry["level"], message: string, detail?: unknown) {
  const entry: Entry = { at: new Date().toISOString(), level, message, detail };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();

  if (process.env.NODE_ENV !== "production") {
    const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    write(`[kk] ${message}`, detail ?? "");
  }
}

export const logClient = {
  info: (message: string, detail?: unknown) => record("info", message, detail),
  warn: (message: string, detail?: unknown) => record("warn", message, detail),
  error: (message: string, detail?: unknown) => record("error", message, detail),
  /** Everything remembered this session, newest last. Handy when debugging on a phone. */
  history: () => [...buffer],
};

if (typeof window !== "undefined") {
  (window as unknown as { kkLogs: () => Entry[] }).kkLogs = logClient.history;
}
