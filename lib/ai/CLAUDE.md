# The AI layer

Two providers, one code path. Groq and OpenRouter are both OpenAI-compatible, so they
differ only in base URL, key and model names. Anthropic is a third option for when
quality matters more than cost.

Everything here was learned by calling the real APIs. None of it is in the docs.

---

## Structured outputs, never tool calling

Free models are unreliable at tool calling — several will happily "call" a tool with an
**empty argument object**. That is what made suggestions silently return nothing. The
same models fill in a `response_format: json_schema` reliably.

Switching cut a broken 46-second call to a working 2.6-second one. Do not go back to
tools, however tempting the API looks.

## Strict mode, and its three rules

`strict: true` constrains the decoder so invalid JSON is impossible. Best-effort mode
only asks nicely, and models do fail — one emitted the literal key `"nutrition_note**: "`,
and Groq rejected whole responses with *"Failed to generate JSON"* once a flat had
dishes in its library.

Strict mode requires, and `prompts/strict.ts` enforces:

1. every property listed in `required`
2. `additionalProperties: false` on every object
3. anything genuinely optional expressed as a nullable union, not omitted

**Never put `minItems` or `maxItems` in a schema.** Groq's decoder rejects the whole
request. Ask for a count in the prompt text instead.

Because rule 1 forces every field to be present, the model returns `null` for nutrients
it cannot estimate. Those **must be dropped before storing** — a null saved as `0`
invents a nutritional shortfall.

## Reasoning effort is per model

Hybrid-thinking models spend their entire budget reasoning about a task this
mechanical: one dish lookup went from 90 seconds (and a truncated answer) to 2 seconds
with thinking off.

The spelling differs by provider **and by model within a provider**:

| | Parameter |
|---|---|
| OpenRouter | `reasoning: { enabled: false }` |
| Groq, `qwen/qwen3.*` | `reasoning_effort: "none"` |
| Groq, everything else | `reasoning_effort: "low"` — `"none"` is rejected with a 400 |

This one bit hard. Sending `"none"` universally meant **every fallback model failed
with a 400** — so the mechanism built for "the primary is busy" was broken in exactly
that case, and only surfaced when Qwen happened to be busy. `SUPPORTS_NO_REASONING` in
`client.ts` decides this per model.

A 400 is therefore treated as **retryable**: one model refusing a parameter its
siblings accept should move down the chain, not fail the request.

## Timeouts share one budget

Every attempt draws from a single 50-second budget, with 15 seconds per model. This is
not arbitrary — Vercel kills a function at 60s, and a 55s timeout with one retry meant
111 seconds, so the platform killed the request before the error handling could return
a readable message. The user saw a raw 504.

Free endpoints **queue rather than refuse** when busy, and OpenRouter's own fallback
list only engages on an *error*. A merely-slow model is waited on forever. So the chain
is walked manually: time each attempt out and try the next model.

## Smaller landmines

- **OpenRouter writes SSE keep-alive comments into the body** of slow non-streaming
  responses. `res.json()` fails on it. `readBody()` strips lines beginning with `:`.
- **OpenRouter's `models` routing array accepts at most 3 entries**, including the
  primary.
- **OpenRouter free endpoints are refused with a 404** unless the account enables
  *"free endpoints that may train on inputs"*. The message mentions "data policy" and
  `providerError` detects it specifically, because the raw 404 is deeply misleading.
- Groq reports remaining quota at `GET /api/v1/key` — useful for telling "I am rate
  limited" apart from "the provider is busy", which look identical from a 429.

## Privacy

Free-tier prompts may be used for training, on both providers. **Flatmates' names are
stripped before anything leaves the server** — the model sees `Flatmate 1: veg, goal
gain, allergic to peanuts`. Ages, heights and weights are never sent. Keep it that way
when adding context to a prompt.

## Editing prompts

All prompt text lives in `prompts/`, one file per prompt, each exporting
`SCHEMA` / `system()` / `user()`. See `prompts/README.md`. Wording is free to change;
schema field names are a contract with the code that reads them.
