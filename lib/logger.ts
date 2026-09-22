import "server-only";

/**
 * Structured logging. One line of JSON per event in production so it can be filtered
 * in Vercel's log viewer; something readable in development.
 *
 * Usage:
 *   const log = logger("plan");
 *   log.info("entry added", { householdId, dishId });
 *   log.error("enrich failed", err, { dishId });
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase() as Level | undefined;
  if (configured && configured in LEVEL_ORDER) return LEVEL_ORDER[configured];
  return process.env.NODE_ENV === "production" ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

/** Never let a connection string, key or token reach the logs. */
const SECRET_KEY = /(password|secret|token|key|authorization|cookie|connection)/i;

/** Nor an email address, wherever it turns up in a value. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 4).join("\n") };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Fields).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1)]),
    );
  }
  if (typeof value === "string") {
    const masked = value.replace(EMAIL, "[email]");
    return masked.length > 500 ? `${masked.slice(0, 500)}…` : masked;
  }
  return value;
}

function emit(scope: string, level: Level, message: string, fields?: Fields) {
  if (LEVEL_ORDER[level] < minLevel()) return;

  const payload = { level, scope, message, ...(fields ? (scrub(fields) as Fields) : {}) };
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (process.env.NODE_ENV === "production") {
    write(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
    return;
  }

  const extras = fields ? ` ${JSON.stringify(scrub(fields))}` : "";
  write(`[${scope}] ${message}${extras}`);
}

export type Logger = {
  debug: (message: string, fields?: Fields) => void;
  info: (message: string, fields?: Fields) => void;
  warn: (message: string, fields?: Fields) => void;
  error: (message: string, error?: unknown, fields?: Fields) => void;
  /** Times an operation and logs how long it took, whether it worked or threw. */
  time: <T>(message: string, fn: () => Promise<T>, fields?: Fields) => Promise<T>;
};

export function logger(scope: string): Logger {
  return {
    debug: (message, fields) => emit(scope, "debug", message, fields),
    info: (message, fields) => emit(scope, "info", message, fields),
    warn: (message, fields) => emit(scope, "warn", message, fields),
    error: (message, error, fields) =>
      emit(scope, "error", message, { ...fields, ...(error !== undefined ? { error: scrub(error) } : {}) }),
    time: async (message, fn, fields) => {
      const started = Date.now();
      try {
        const result = await fn();
        emit(scope, "info", message, { ...fields, ms: Date.now() - started, ok: true });
        return result;
      } catch (error) {
        emit(scope, "error", message, { ...fields, ms: Date.now() - started, ok: false, error: scrub(error) });
        throw error;
      }
    },
  };
}
