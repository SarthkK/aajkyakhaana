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
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
  anthropic: "claude-sonnet-5",
};

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
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiError("AI is not configured. Add OPENROUTER_API_KEY to your environment.");

  const model = aiModel();

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
        max_tokens: opts.maxTokens ?? 2000,
        temperature: 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: opts.tool.name,
              description: opts.tool.description,
              parameters: opts.tool.input_schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: opts.tool.name } },
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

  // A proxy or gateway can answer 200 with an HTML error page.
  let body: OpenRouterResponse;
  try {
    body = (await res.json()) as OpenRouterResponse;
  } catch {
    throw new AiError("OpenRouter sent back something unreadable. Try again.", true);
  }

  // Some providers report errors with a 200 status.
  if (body.error?.message) throw new AiError(`The model refused: ${body.error.message}`, true);

  const message = body.choices?.[0]?.message;
  if (!message) throw new AiError("The model returned an empty answer. Try again.", true);

  const args = message.tool_calls?.[0]?.function?.arguments;
  if (args != null) {
    // Most providers send a JSON string; a few send the object already parsed.
    return (typeof args === "string" ? parseJson<T>(args, model) : (args as T));
  }

  // Free models sometimes ignore tool_choice and just write the JSON out.
  if (message.content) return parseJson<T>(message.content, model);

  throw new AiError(
    `${model} did not return structured data. Try a different OPENROUTER_MODEL.`,
    true,
  );
}

type OpenRouterResponse = {
  error?: { message?: string };
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
