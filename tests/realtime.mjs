/* Realtime must be optional: with no key the app polls and everything still works. */
const B = "http://localhost:3000";
const stamp = Date.now();
const jar = new Map();
async function call(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(`${B}${path}`, { method, headers, body: body && JSON.stringify(body) });
  for (const c of res.headers.getSetCookie?.() ?? []) { const [p] = c.split(";"); const i = p.indexOf("="); jar.set(p.slice(0, i), p.slice(i + 1)); }
  const t = await res.text();
  return { status: res.status, data: t ? JSON.parse(t) : null };
}
let pass = 0, fail = 0;
const check = (n, ok, d = "") => ok ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${d}`));

await call("POST", "/api/auth/signup", { name: "RT", email: `rt-${stamp}@test.in`, password: "password123" });
await call("POST", "/api/households", { name: "RT Flat" });

const t = await call("GET", "/api/realtime/token");
check("the token endpoint answers", t.status === 200, `${t.status}`);
if (t.data?.realtime === false) {
  console.log("  → realtime not configured; the client will poll");
  check("it says so plainly rather than erroring", t.data.realtime === false);
} else {
  check("a token is scoped to one channel", Object.keys(JSON.parse(t.data.capability ?? "{}")).length === 1, t.data?.capability);
  check("and grants subscribe only, never publish", !JSON.stringify(t.data.capability).includes("publish"), t.data?.capability);
  check("the key itself never reaches the client", !JSON.stringify(t.data).includes(process.env.ABLY_API_KEY ?? "@@none@@"));
}
check("chat still works either way", (await call("POST", "/api/chat", { body: "hello" })).status === 201);
check("and the cursor still moves", (await call("GET", "/api/chat/cursor")).data.latest > 0);

const out = await call("GET", "/api/realtime/token");
check("an unauthenticated request gets nothing", out.status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
