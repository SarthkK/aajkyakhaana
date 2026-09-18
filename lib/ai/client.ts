import "server-only";
import { logger } from "@/lib/logger";

/**
 * One small wrapper over whichever model provider is configured.
 *
 * Groq and OpenRouter are both OpenAI-compatible, so they share a single code path and
 * differ only in base URL, key and model names. Anthropic is kept for when you want
 * better answers and don't mind paying. Every provider is asked for structured output
 * the same way, so the rest of the app never has to care which one is in use.
 */

const log = logger("ai");

export type Provider = "groq" | "openrouter" | "anthropic";

type ProviderConfig = {
  keyEnv: string;
  modelEnv: string;
  fallbackEnv: string;
  defaultModel: string;
  /** Tried in order when the one before it is busy or too slow. */
  defaultFallbacks: string[];
};

const PROVIDERS: Record<Provider, ProviderConfig> = {
  groq: {
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    fallbackEnv: "GROQ_FALLBACKS",
    // Same Qwen as on OpenRouter, but on dedicated hardware with a far larger quota.
    defaultModel: "qwen/qwen3.8-27b",
    defaultFallbacks: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  openrouter: {
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    fallbackEnv: "OPENROUTER_FALLBACKS",
    defaultModel: "qwen/qwen3.8-27b:free",
    defaultFallbacks: ["nex-agi/nex-n2.5-mini:free", "nvidia/nemotron-3-super-120b-a12b:free"],
  },
  anthropic: {
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    fallbackEnv: "ANTHROPIC_FALLBACKS",
    defaultModel: "claude-sonnet-5",
    defaultFallbacks: [],
  },
};

const OPENAI_COMPATIBLE: Partial<Record<Provider, { url: string; label: string; freeTierNote: string }>> = {
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    label: "Groq",
    freeTierNote: "Groq's free limit is 30 requests/minute and 14,400/day.",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    label: "OpenRouter",
    freeTierNote: "OpenRouter's free limit is 20 per minute and 50 per day.",
  },
};

export function provider(): Provider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "groq" || explicit === "openrouter" || explicit === "anthropic") return explicit;
  // Nothing declared: use whichever key is actually present, best free option first.
  for (const name of ["groq", "openrouter", "anthropic"] as const) {
    if (process.env[PROVIDERS[name].keyEnv]) return name;
  }
  return "groq";
}

function config(): ProviderConfig {
  return PROVIDERS[provider()];
}

export function aiModel() {
  const c = config();
  return process.env[c.modelEnv] || c.defaultModel;
}

/** Primary model plus the fallbacks we walk when it is busy or slow. */
function modelChain(): string[] {
  const c = config();
  const configured = process.env[c.fallbackEnv]?.split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([aiModel(), ...(configured ?? c.defaultFallbacks)])].slice(0, 3);
}

export function aiEnabled() {
  return Boolean(process.env[config().keyEnv]);
}

/** The env var the user needs to set, used in the "AI is off" messages. */
export function missingKeyName() {
  return config().keyEnv;
}

/** One structured request. Schema and wording both come from lib/ai/prompts. */
export type AiRequest = {
  /** Schema name sent to the provider; also the log label. */
  name: string;
  description: string;
  schema: Record<string, unknown>;
  system: string;
  prompt: string;
  maxTokens?: number;
};

export class AiError extends Error {
  /** True when retrying later is the right advice (rate limits, provider hiccups). */
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * Ask the model for a single structured object. We force a tool call rather than
 * parsing prose, so callers always get an object or a thrown error.
 */
export async function askForObject<T>(req: AiRequest): Promise<T> {
  return provider() === "anthropic" ? askAnthropic<T>(req) : askOpenAICompatible<T>(req);
}

/* -------------------------------- openrouter ------------------------------- */

/**
 * Everything here has to finish inside the hosting platform's function limit (60s on
 * Vercel), otherwise the request is killed and the caller gets a raw gateway timeout
 * instead of a message telling them to try again. So the retry shares one budget with
 * the first attempt rather than getting a fresh timeout of its own.
 */
const TOTAL_BUDGET_MS = 50_000;
const ATTEMPT_BUDGET_MS = 15_000;
const RETRY_DELAY_MS = 800;

/**
 * Free endpoints queue rather than refuse when they are busy, and OpenRouter's own
 * fallback list only engages on an *error* — a model that is merely slow is waited
 * on indefinitely. So we time each attempt out ourselves and move down the chain,
 * which turns "congested for two minutes" into "answered by the second model".
 *
 * The whole thing has to finish inside the hosting platform's function limit (60s on
 * Vercel), so every attempt shares one budget instead of getting a fresh timeout.
 */
async function askOpenAICompatible<T>(opts: AiRequest): Promise<T> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const chain = modelChain();
  let lastError: unknown;

  for (const [index, model] of chain.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < 4_000) break;

    try {
      return await callOpenRouter<T>(opts, model, Math.min(ATTEMPT_BUDGET_MS, remaining));
    } catch (err) {
      lastError = err;
      // A real refusal (bad key, bad request) will fail the same way on every model.
      if (!(err instanceof AiError) || !err.retryable) throw err;
      if (index < chain.length - 1) {
        log.warn("model did not answer in time, moving down the chain", { model, next: chain[index + 1] });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  // Keep the real reason — "rate limited" and "returned junk" need different responses
  // from whoever reads it. Only note the chain length, rather than replacing the cause.
  if (lastError instanceof AiError) {
    if (chain.length === 1) throw lastError;
    throw new AiError(`${lastError.message} (tried ${chain.length} models)`, lastError.retryable);
  }
  throw lastError ?? new AiError("The AI call failed. Try again.", true);
}

async function callOpenRouter<T>(opts: AiRequest, model: string, timeoutMs: number): Promise<T> {
  try {
    return await doCall<T>(opts, model, timeoutMs);
  } catch (err) {
    if (err instanceof AiError) throw err;
    // A timeout can fire while the body is still being read, which lands here as a
    // DOMException rather than anything the fetch try/catch would have seen.
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AiError("The free model took too long to answer. Try again.", true);
    }
    log.error("unexpected provider failure", err, { model });
    throw new AiError("The AI call failed unexpectedly. Try again.", true);
  }
}

async function doCall<T>(opts: AiRequest, model: string, timeoutMs: number): Promise<T> {
  const api = OPENAI_COMPATIBLE[provider()];
  const key = process.env[config().keyEnv];
  if (!api || !key) {
    throw new AiError(`AI is not configured. Add ${config().keyEnv} to your environment.`);
  }

  let res: Response;
  try {
    res = await fetch(api.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Attribution headers OpenRouter uses for its leaderboards; ignored elsewhere.
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Kya Khaana",
      },
      body: JSON.stringify({
        model,
        // OpenRouter-only: prefer whichever upstream is currently fastest. Ignored by Groq.
        ...(provider() === "openrouter" ? { provider: { sort: "throughput" } } : {}),
        max_tokens: opts.maxTokens ?? 2000,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `${opts.system}\n\n${opts.description}\nMatch this schema exactly:\n${JSON.stringify(opts.schema)}`,
          },
          { role: "user", content: opts.prompt },
        ],
        // Structured output beats tool calling on free models: several of them will
        // happily "call" a tool with no arguments at all, but reliably fill in a schema.
        response_format: {
          type: "json_schema",
          json_schema: {
            name: opts.name,
            // Strict mode restricts which schema features are allowed and is unevenly
            // supported; we validate and normalise the result ourselves anyway.
            strict: false,
            schema: opts.schema,
          },
        },
        // Hybrid-thinking models take ~90s with reasoning on and ~2s with it off, for
        // no gain on a task this mechanical. The two providers spell it differently,
        // and each rejects the other's spelling outright.
        ...(provider() === "groq" ? { reasoning_effort: "none" } : { reasoning: { enabled: false } }),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AiError("The model took too long to answer. Try again.", true);
    }
    throw new AiError(`Could not reach ${api.label}. Check your connection.`, true);
  }

  if (!res.ok) throw providerError(res.status, await res.text(), api);

  const body = await readBody(res);

  // Some providers report errors with a 200 status.
  if (body.error?.message) throw new AiError(`The model refused: ${body.error.message}`, true);

  const message = body.choices?.[0]?.message;
  if (!message) throw new AiError("The model returned an empty answer. Try again.", true);

  if (body.model && body.model !== model) {
    log.info("provider rerouted the request", { asked: model, answered: body.model });
  }

  if (message.content) return parseJson<T>(message.content, model);

  // Some providers answer a schema request with a tool call anyway.
  const args = message.tool_calls?.[0]?.function?.arguments;
  if (args != null) {
    return typeof args === "string" ? parseJson<T>(args, model) : (args as T);
  }

  throw new AiError(
    `${model} did not return structured data. Try a different OPENROUTER_MODEL.`,
    true,
  );
}

/**
 * While a slow request is in flight OpenRouter keeps the connection alive by writing
 * SSE-style comment lines (": OPENROUTER PROCESSING") ahead of the real body, which
 * makes a plain res.json() fail. Strip those, then parse.
 */
async function readBody(res: Response): Promise<OpenRouterResponse> {
  const text = await res.text();
  const cleaned = text
    .split("\n")
    .filter((line) => !line.startsWith(":"))
    .join("\n")
    .trim();

  if (!cleaned) throw new AiError("The provider sent back an empty response. Try again.", true);

  try {
    return JSON.parse(cleaned) as OpenRouterResponse;
  } catch {
    log.error("unparseable response body", undefined, { body: text.slice(0, 200) });
    throw new AiError("The provider sent back something unreadable. Try again.", true);
  }
}

type OpenRouterResponse = {
  error?: { message?: string };
  /** Which model actually served the request, after any fallback routing. */
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string | object } }[];
    };
  }[];
};

function providerError(
  status: number,
  text: string,
  api: { label: string; freeTierNote: string },
): AiError {
  let detail = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // keep the raw text
  }

  const keyEnv = config().keyEnv;
  const modelEnv = config().modelEnv;

  if (status === 401 || status === 403) {
    return new AiError(`${api.label} rejected the API key. Check ${keyEnv}.`);
  }
  if (status === 402) {
    return new AiError(`This model is not free on your ${api.label} account. Pick a free one.`);
  }
  if (status === 429) {
    return new AiError(`${api.freeTierNote} Try again in a bit.`, true);
  }
  if (status === 404 || status === 400) {
    // OpenRouter only offers free endpoints to accounts that allow training on
    // inputs, and reports that refusal as a 404 rather than a 403.
    if (/data policy/i.test(detail)) {
      return new AiError(
        "OpenRouter is blocking free models for this account. Turn on 'Enable free endpoints that may train on inputs' at openrouter.ai/settings/privacy.",
      );
    }
    if (/model/i.test(detail)) {
      return new AiError(`${api.label} does not know that model. Check ${modelEnv}. (${detail})`);
    }
    return new AiError(`${api.label} rejected the request (${status}): ${detail}`);
  }
  if (status >= 500) return new AiError(`${api.label} is having trouble right now. Try again.`, true);
  return new AiError(`${api.label} error (${status}): ${detail}`);
}

/** Free models like to wrap JSON in prose or code fences — dig it out anyway. */
function parseJson<T>(raw: string, model: string): T {
  const text = raw.trim();

  const attempts = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) attempts.push(text.slice(firstBrace, lastBrace + 1));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      // try the next shape
    }
  }

  throw new AiError(`${model} returned something that wasn't valid JSON. Try again.`, true);
}

/* --------------------------------- anthropic ------------------------------- */

async function askAnthropic<T>(opts: AiRequest): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiError("AI is not configured. Add ANTHROPIC_API_KEY to your environment.");
  }

  // Imported lazily so the SDK is never loaded when OpenRouter is the provider.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const res = await client.messages.create({
    model: aiModel(),
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    tools: [{ name: opts.name, description: opts.description, input_schema: opts.schema as never }],
    tool_choice: { type: "tool", name: opts.name },
    messages: [{ role: "user", content: opts.prompt }],
  });

  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new AiError("The AI did not return a usable answer. Try again.", true);
  }
  return block.input as T;
}
