/*
 * The whole realtime loop: one flatmate subscribes the way the browser does, another
 * acts, and the first must hear about it. Skipped when no key is configured.
 */
import Ably from "ably";

const B = process.env.BASE ?? "http://localhost:3000";
const stamp = Date.now();

function client() {
  const jar = new Map();
  return async (method, path, body) => {
    const headers = { "Content-Type": "application/json" };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(`${B}${path}`, { method, headers, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [p] = c.split(";"); const i = p.indexOf("=");
      jar.set(p.slice(0, i), p.slice(i + 1));
    }
    const t = await res.text();
    return { status: res.status, data: t ? JSON.parse(t) : null };
  };
}

let pass = 0, fail = 0;
const check = (n, ok, d = "") => ok ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${d}`));

const A = client(), K = client();
await A("POST", "/api/auth/signup", { name: "Sarthk", email: `lr1-${stamp}@test.in`, password: "password123" });
const flat = await A("POST", "/api/households", { name: "Live Flat" });
await K("POST", "/api/auth/signup", { name: "Khushi", email: `lr2-${stamp}@test.in`, password: "password123" });
await K("POST", "/api/households/join", { code: flat.data.household.code });

const probe = await K("GET", "/api/realtime/token");
if (probe.data?.realtime === false) {
  console.log("  realtime not configured — skipping (the app polls instead)");
  process.exit(0);
}

// Khushi's phone connects exactly as the browser client does: a token, not the key.
const ably = new Ably.Realtime({
  authCallback: (_p, cb) => { K("GET", "/api/realtime/token").then((r) => cb(null, r.data)).catch((e) => cb(e, null)); },
  echoMessages: false,
});
const channelName = Object.keys(JSON.parse(probe.data.capability))[0];
const channel = ably.channels.get(channelName);

const received = [];
await channel.subscribe((m) => received.push({ event: m.name, data: m.data, at: Date.now() }));
await new Promise((r) => setTimeout(r, 1200));
check("a flatmate's phone can subscribe", ably.connection.state === "connected", ably.connection.state);

function waitFor(event, ms = 6000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const c = () => {
      const hit = received.find((r) => r.event === event && r.at >= start - 50);
      if (hit) resolve({ hit, ms: hit.at - start });
      else if (Date.now() - start > ms) resolve(null);
      else setTimeout(c, 10);
    };
    c();
  });
}

console.log("\nA message reaches the other phone");
let t0 = Date.now();
const posted = await A("POST", "/api/chat", { body: "dinner?" });
let got = await waitFor("feed");
check("the nudge arrives", Boolean(got), JSON.stringify(received.slice(-2)));
check("it carries the new cursor", got?.hit?.data?.cursor === posted.data.message.id, JSON.stringify(got?.hit?.data));
check("and nothing else — no message text", !JSON.stringify(got?.hit?.data ?? {}).toLowerCase().includes("dinner"), JSON.stringify(got?.hit?.data));
console.log(`  → delivered in ${Date.now() - t0}ms`);

console.log("\nThe assistant announces itself before it thinks");
received.length = 0;
const asking = A("POST", "/api/chat/ask");
got = await waitFor("thinking", 8000);
check("everyone sees it composing", Boolean(got));
await asking;
got = await waitFor("feed", 20000);
check("and the reply nudges too", Boolean(got));

console.log("\nA vote moves everyone's bar");
received.length = 0;
const poll = await A("POST", "/api/chat/poll", { slot: "dinner" });
await waitFor("feed", 8000);
received.length = 0;
t0 = Date.now();
await K("POST", `/api/chat/poll/${poll.data.messageId}/vote`, { option: 0 });
got = await waitFor("feed");
check("a vote nudges the flat", Boolean(got));
check("without a cursor, so the card is refetched", got?.hit?.data?.cursor === undefined, JSON.stringify(got?.hit?.data));
console.log(`  → delivered in ${Date.now() - t0}ms`);

console.log("\nAnother flat cannot listen in");
const OUT = client();
await OUT("POST", "/api/auth/signup", { name: "Out", email: `lr3-${stamp}@test.in`, password: "password123" });
await OUT("POST", "/api/households", { name: "Other Flat" });
const outsider = await OUT("GET", "/api/realtime/token");
const outsiderChannel = Object.keys(JSON.parse(outsider.data.capability))[0];
check("their token names a different channel", outsiderChannel !== channelName, `${outsiderChannel} vs ${channelName}`);
check("and cannot publish anywhere", !JSON.stringify(outsider.data.capability).includes("publish"), outsider.data.capability);

ably.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
