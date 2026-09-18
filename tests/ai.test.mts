/**
 * Exercises the OpenRouter response handling without calling the real API:
 * a well-behaved tool call, the shapes free models actually produce when they
 * misbehave, and the error statuses.
 */
process.env.OPENROUTER_API_KEY = "test-key";
process.env.AI_PROVIDER = "openrouter";
// One model in the chain, so each mocked failure surfaces its own message.
process.env.OPENROUTER_FALLBACKS = "qwen/qwen3.8-27b:free";

const { askForObject, AiError } = await import("../lib/ai/client.ts");

const request = {
  name: "save",
  description: "save it",
  schema: { type: "object", properties: { dish: { type: "string" } }, required: ["dish"] },
  system: "s",
  prompt: "p",
};

const payload = { dish: "Rajma Chawal" };
let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

function mock(status: number, body: unknown, raw?: string) {
  globalThis.fetch = (async () =>
    new Response(raw ?? JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

async function attempt() {
  return askForObject(request);
}

console.log("\nstructured answers:");

mock(200, { choices: [{ message: { tool_calls: [{ function: { name: "save", arguments: JSON.stringify(payload) } }] } }] });
check("tool call with JSON string args", JSON.stringify(await attempt()) === JSON.stringify(payload));

mock(200, { choices: [{ message: { tool_calls: [{ function: { name: "save", arguments: payload } }] } }] });
check("tool call with pre-parsed object args", JSON.stringify(await attempt()) === JSON.stringify(payload));

mock(200, { choices: [{ message: { content: JSON.stringify(payload) } }] });
check("ignored tool_choice, plain JSON in content", JSON.stringify(await attempt()) === JSON.stringify(payload));

mock(200, { choices: [{ message: { content: "```json\n" + JSON.stringify(payload) + "\n```" } }] });
check("JSON wrapped in a code fence", JSON.stringify(await attempt()) === JSON.stringify(payload));

mock(200, { choices: [{ message: { content: `Sure! Here you go:\n${JSON.stringify(payload)}\nHope that helps.` } }] });
check("JSON buried in prose", JSON.stringify(await attempt()) === JSON.stringify(payload));

console.log("\nerrors:");

async function expectError(name: string, match: RegExp, retryable?: boolean) {
  try {
    await attempt();
    check(name, false, "(no error thrown)");
  } catch (err) {
    const e = err as InstanceType<typeof AiError>;
    const okMsg = err instanceof AiError && match.test(e.message);
    const okRetry = retryable === undefined || e.retryable === retryable;
    check(name, okMsg && okRetry, `got: "${e.message}" retryable=${e.retryable}`);
  }
}

mock(401, { error: { message: "No auth" } });
await expectError("401 -> check your key", /rejected the API key/, false);

mock(402, { error: { message: "Insufficient credits" } });
await expectError("402 -> pick a :free model", /not free/i, false);

mock(429, { error: { message: "Rate limited" } });
await expectError("429 -> free limit, retryable", /50 per day/i, true);

mock(404, { error: { message: "No such model available" } });
await expectError("404 -> check OPENROUTER_MODEL", /OPENROUTER_MODEL/, false);

mock(404, { error: { message: "No endpoints found matching your data policy" } });
await expectError("404 data policy -> privacy setting", /settings\/privacy/, false);

mock(503, { error: { message: "upstream down" } });
await expectError("5xx -> retryable", /having trouble/i, true);

mock(200, { error: { message: "context length exceeded" } });
await expectError("200 body carrying an error", /model refused/i, true);

mock(200, { choices: [{ message: { content: "I cannot help with that." } }] });
await expectError("unparseable content", /wasn't valid JSON/, true);

mock(200, { choices: [] });
await expectError("empty choices", /empty answer/, true);

mock(200, {}, "<html>gateway timeout</html>");
await expectError("non-JSON body", /unreadable/, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
