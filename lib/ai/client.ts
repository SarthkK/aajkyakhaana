import "server-only";

/**
 * One small wrapper over whichever model provider is configured.
 *
 * Default is OpenRouter, which has a free tier (models whose id ends in ":free").
 * Anthropic is kept as an option for when you want better answers and don't mind paying.
 * Both are asked for structured output the same way — by forcing a tool call — so the
 * rest of the app never has to care which one is in use.
 */

export type Provider = "openrouter" | "anthropic";

export function provider(): Provider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "anthropic" || explicit === "openrouter") return explicit;
  // Fall back to whichever key is actually present.
  return process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY ? "anthropic" : "openrouter";
}

const DEFAULT_MODELS: Record<Provider, string> = {
  openrouter: "qwen/qwen3.8-27b:free",
  anthropic: "claude-sonnet-5",
};

/**
 * Free endpoints are throttled by the upstream provider at random, independently of
 * your own daily quota. OpenRouter will walk this list in order when one is busy, so
 * a shared-capacity 429 turns into a slightly different answer instead of an error.
 * All of these were checked against the real dish schema; ordered best-first.
 */
const OPENROUTER_FALLBACKS = [
  "nex-agi/nex-n2.5-mini:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

function openRouterModelChain(): string[] {
  const primary = aiModel();
  const configured = process.env.OPENROUTER_FALLBACKS?.split(",").map((m) => m.trim()).filter(Boolean);
  const chain = [primary, ...(configured ?? OPENROUTER_FALLBACKS)];
  // OpenRouter rejects a routing list longer than three.
  return [...new Set(chain)].slice(0, 3);
}

export function aiModel() {
  const p = provider();
  return (p === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENROUTER_MODEL) || DEFAULT_MODELS[p];
}

export function aiEnabled() {
  return Boolean(provider() === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENROUTER_API_KEY);
}

/** The env var the user needs to set, used in the "AI is off" messages. */
export function missingKeyName() {
  return provider() === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENROUTER_API_KEY";
}

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
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
export async function askForObject<T>(opts: {
  system: string;
  prompt: string;
  tool: ToolDef;
  maxTokens?: number;
}): Promise<T> {
  return provider() === "anthropic" ? askAnthropic<T>(opts) : askOpenRouter<T>(opts);
}

/* -------------------------------- openrouter ------------------------------- */

async function askOpenRouter<T>(opts: {
  system: string;
  prompt: string;
  tool: ToolDef;
  maxTokens?: number;
}): Promise<T> {
  try {
    return await callOpenRouter<T>(opts);
  } catch (err) {
    // Free endpoints get throttled by the upstream provider at random, separately
    // from the daily quota. One retry turns most of those into a normal success.
    if (err instanceof AiError && err.retryable) {
      await new Promise((r) => setTimeout(r, 1500));
      return callOpenRouter<T>(opts);
    }
    throw err;
  }
}

async function callOpenRouter<T>(opts: {
  system: string;
  prompt: string;
  tool: ToolDef;
  maxTokens?: number;
}): Promise<T> {
  try {
    return await doCall<T>(opts);
  } catch (err) {
    if (err instanceof AiError) throw err;
    // A timeout can fire while the body is still being read, which lands here as a
    // DOMException rather than anything the fetch try/catch would have seen.
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AiError("The free model took too long to answer. Try again.", true);
    }
    console.error("[ai] unexpected failure:", err);
    throw new AiError("The AI call failed unexpectedly. Try again.", true);
  }
}

async function doCall<T>(opts: {
  system: string;
  prompt: string;
  tool: ToolDef;
  maxTokens?: number;
}): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiError("AI is not configured. Add OPENROUTER_API_KEY to your environment.");

  const chain = openRouterModelChain();
  const model = chain[0];

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional attribution headers OpenRouter uses for its leaderboards.
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Kya Khaana",
      },
      body: JSON.stringify({
        model,
        // OpenRouter falls through this list when a provider is busy or errors.
        models: chain,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `${opts.system}\n\n${opts.tool.description}\nReply with JSON only — no prose, no code fences — matching this schema:\n${JSON.stringify(opts.tool.input_schema)}`,
          },
          { role: "user", content: opts.prompt },
        ],
        // Structured output beats tool calling on free models: several of them will
        // happily "call" a tool with no arguments at all, but reliably fill in a schema.
        response_format: {
          type: "json_schema",
          json_schema: {
            name: opts.tool.name,
            // Strict mode restricts which schema features are allowed and is unevenly
            // supported; we validate and normalise the result ourselves anyway.
            strict: false,
            schema: opts.tool.input_schema,
          },
        },
        // Hybrid-thinking models take ~90s with reasoning on and ~2s with it off,
        // for no gain on a task this mechanical. Ignored by models without it.
        reasoning: { enabled: false },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AiError("The free model took too long to answer. Try again.", true);
    }
    throw new AiError("Could not reach OpenRouter. Check your connection.", true);
  }

  if (!res.ok) throw openRouterError(res.status, await res.text());

  const body = await readBody(res);

  // Some providers report errors with a 200 status.
  if (body.error?.message) throw new AiError(`The model refused: ${body.error.message}`, true);

  const message = body.choices?.[0]?.message;
  if (!message) throw new AiError("The model returned an empty answer. Try again.", true);

  if (body.model && body.model !== model) {
    console.log(`[ai] ${model} was busy, ${body.model} answered instead`);
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

  if (!cleaned) throw new AiError("OpenRouter sent back an empty response. Try again.", true);

  try {
    return JSON.parse(cleaned) as OpenRouterResponse;
  } catch {
    console.error("[ai] unparseable OpenRouter body:", text.slice(0, 200));
    throw new AiError("OpenRouter sent back something unreadable. Try again.", true);
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

function openRouterError(status: number, text: string): AiError {
  let detail = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // keep the raw text
  }

  if (status === 401) return new AiError("OpenRouter rejected the API key. Check OPENROUTER_API_KEY.");
  if (status === 402) return new AiError("This model is not free on your OpenRouter account. Pick a model ending in ':free'.");
  if (status === 429) {
    return new AiError(
      "OpenRouter's free limit is reached (20 per minute, 50 per day). Try again in a bit.",
      true,
    );
  }
  if (status === 404) {
    // Free endpoints are only offered to accounts that allow training on inputs,
    // and OpenRouter reports that refusal as a 404 rather than a 403.
    if (/data policy/i.test(detail)) {
      return new AiError(
        "OpenRouter is blocking free models for this account. Turn on 'Enable free endpoints that may train on inputs' at openrouter.ai/settings/privacy.",
      );
    }
    return new AiError("OpenRouter does not know that model. Check OPENROUTER_MODEL.");
  }
  if (status >= 500) return new AiError("OpenRouter is having trouble right now. Try again.", true);
  return new AiError(`OpenRouter error (${status}): ${detail}`);
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

async function askAnthropic<T>(opts: {
  system: string;
  prompt: string;
  tool: ToolDef;
  maxTokens?: number;
}): Promise<T> {
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
    tools: [
      {
        name: opts.tool.name,
        description: opts.tool.description,
        input_schema: opts.tool.input_schema as never,
      },
    ],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.prompt }],
  });

  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new AiError("The AI did not return a usable answer. Try again.", true);
  }
  return block.input as T;
}

/* ---------------------------------- prompt --------------------------------- */

/** Shared framing so every prompt gets the same Indian-kitchen assumptions. */
export const INDIAN_KITCHEN_CONTEXT = `You are helping a shared flat in India plan what their cook should make.
Assume an ordinary Indian home kitchen and an Indian grocery run (kirana store, Blinkit, Zepto or the local sabzi mandi).

Conventions you must follow:
- Dish names stay in the way Indians say them: "Rajma Chawal", "Aloo Paratha", "Dal Tadka", "Bhindi Masala".
- Quantities are what an Indian household actually buys: grams/kg for vegetables, pulses and meat; ml/l for milk and oil;
  tsp/tbsp for spices; "piece" for eggs, onions, lemons, bread; "bunch" for coriander, methi, palak.
- Everyday spices and staples (salt, haldi, red chilli powder, dhania powder, jeera, garam masala, cooking oil, ghee,
  mustard seeds, hing, sugar) are almost always already in the kitchen. Mark those as pantry staples.
- Nutrition numbers are per serving, for the dish as it is actually eaten at home (with the usual amount of oil/ghee),
  and should be realistic Indian portion sizes — one katori dal, two rotis, one plate rice.

Answer only by calling the provided tool. Do not write any prose.`;
