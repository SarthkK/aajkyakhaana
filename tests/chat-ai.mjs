/* Exercises the chat assistant and the in-chat vote. */
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
const check = (name, ok, detail = "") => ok
  ? (pass++, console.log(`  ok   ${name}`))
  : (fail++, console.log(`  FAIL ${name} ${detail}`));

const A = client(), K = client();
await A("POST", "/api/auth/signup", { name: "Sarthk", email: `c1-${stamp}@test.in`, password: "password123" });
const flat = await A("POST", "/api/households", { name: "Chat AI Flat", cookName: "Sunita ji" });
await A("PUT", "/api/profile", { diet: "nonveg", goal: "gain", dislikes: ["lauki"], sex: "male", age: 25, heightCm: 178, weightKg: 72 });
await K("POST", "/api/auth/signup", { name: "Khushi", email: `c2-${stamp}@test.in`, password: "password123" });
await K("POST", "/api/households/join", { code: flat.data.household.code });
await K("PUT", "/api/profile", { diet: "veg", goal: "maintain" });

for (const n of ["Rajma Chawal", "Aloo Paratha", "Chhole Chawal"]) await A("POST", "/api/dishes", { name: n });

console.log("\nThe assistant");
await A("POST", "/api/chat", { body: "what should we make tonight? something high protein" });
let r = await A("POST", "/api/chat/ask");
check("answers a question in the chat", r.status === 201, `${r.data?.error ?? ""}`);
const reply = r.data?.message;
check("the reply is conversational, not JSON", typeof reply?.body === "string" && reply.body.length > 20 && !reply.body.trim().startsWith("{"));
check("it is posted as an assistant message", reply?.kind === "assistant");
check("it has no author, so it reads as the app", reply?.userId === null);
check("refuses to answer itself twice", (await A("POST", "/api/chat/ask")).status === 409);
console.log(`  → "${reply?.body?.slice(0, 150)}"`);
if (reply?.meta?.dishIdeas?.length) console.log(`  → one-tap ideas: ${reply.meta.dishIdeas.join(", ")}`);

console.log("\nThe flatmate can ask too, and sees the same thread");
await K("POST", "/api/chat", { body: "is that enough veggies though" });
r = await K("POST", "/api/chat/ask");
check("a second person can ask", r.status === 201, `${r.data?.error ?? ""}`);
check("both people see the whole conversation", (await A("GET", "/api/chat")).data.messages.filter((m) => m.kind === "assistant").length === 2);
console.log(`  → "${r.data?.message?.body?.slice(0, 150)}"`);

console.log("\nThe vote");
r = await A("POST", "/api/chat/poll", { slot: "dinner" });
check("starts a vote", r.status === 201, `${r.data?.error ?? ""}`);
const pollId = r.data?.messageId;
check("refuses a second vote while one is open", (await A("POST", "/api/chat/poll", { slot: "dinner" })).status === 409);

let feed = (await K("GET", "/api/chat")).data.messages;
const poll = feed.find((m) => m.kind === "poll");
check("the flatmate sees the vote", Boolean(poll));
check("it offers three options", poll?.meta?.options?.length === 3, `${poll?.meta?.options?.length}`);
check("every option explains itself", (poll?.meta?.options ?? []).every((o) => o.reason?.length > 5));
console.log("  → " + (poll?.meta?.options ?? []).map((o) => `${o.name}${o.isVeg ? "" : " (non-veg)"}`).join("  ·  "));

r = await A("POST", `/api/chat/poll/${pollId}/vote`, { option: 0 });
check("a vote is counted", r.data?.tally?.[0] === 1, JSON.stringify(r.data?.tally));
r = await K("POST", `/api/chat/poll/${pollId}/vote`, { option: 0 });
check("both flatmates' votes count", r.data?.tally?.[0] === 2, JSON.stringify(r.data?.tally));
r = await K("POST", `/api/chat/poll/${pollId}/vote`, { option: 1 });
check("changing your mind moves the vote", r.data?.tally?.[0] === 1 && r.data?.tally?.[1] === 1, JSON.stringify(r.data?.tally));
check("rejects an option that does not exist", (await A("POST", `/api/chat/poll/${pollId}/vote`, { option: 3 })).status === 400);

feed = (await K("GET", "/api/chat")).data.messages;
const withTally = feed.find((m) => m.kind === "poll");
check("the feed carries the running tally", JSON.stringify(withTally?.pollTally) === "[1,1]" || withTally?.pollTally?.length === 3);
check("the feed remembers your own pick", withTally?.myPollVote === 1);

r = await A("POST", `/api/chat/poll/${pollId}/resolve`);
check("locking it in picks a winner", r.status === 200 && typeof r.data?.winner === "string", `${r.data?.error ?? ""}`);
console.log(`  → winner: ${r.data?.winner}`);
check("the winner lands on the plan", (await A("GET", "/api/plan")).data.entries.some((e) => e.dish.name === r.data.winner));
check("it cannot be settled twice", (await A("POST", `/api/chat/poll/${pollId}/resolve`)).status === 409);
check("voting closes once settled", (await K("POST", `/api/chat/poll/${pollId}/vote`, { option: 0 })).status === 409);
check("the feed records that the flat decided", (await A("GET", "/api/chat")).data.messages.some((m) => m.kind === "meal_settled"));

console.log("\nIsolation");
const OUT = client();
await OUT("POST", "/api/auth/signup", { name: "Out", email: `c3-${stamp}@test.in`, password: "password123" });
await OUT("POST", "/api/households", { name: "Other" });
check("an outsider cannot vote in another flat's poll", (await OUT("POST", `/api/chat/poll/${pollId}/vote`, { option: 0 })).status === 404);
check("an outsider cannot settle it", (await OUT("POST", `/api/chat/poll/${pollId}/resolve`)).status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
