/* Exercises every feature against a running server. Reports pass/fail per check. */
const BASE = process.env.BASE ?? "http://localhost:3000";

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  \x1b[32mok\x1b[0m   ${name}`); }
  else { fail++; failures.push(name); console.log(`  \x1b[31mFAIL\x1b[0m ${name} ${detail}`); }
}
function section(title) { console.log(`\n\x1b[1m${title}\x1b[0m`); }

/** A browser-like session with its own cookie jar. */
function session() {
  const jar = new Map();
  return {
    async req(method, path, body) {
      const headers = { "Content-Type": "application/json" };
      if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const res = await fetch(`${BASE}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx), value = pair.slice(idx + 1);
        if (value === "" ) jar.delete(name); else jar.set(name, value);
      }
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data };
    },
    get(p) { return this.req("GET", p); },
    post(p, b) { return this.req("POST", p, b ?? {}); },
    put(p, b) { return this.req("PUT", p, b); },
    patch(p, b) { return this.req("PATCH", p, b); },
    del(p) { return this.req("DELETE", p); },
  };
}

const stamp = Date.now();
const email = (n) => `e2e-${n}-${stamp}@test.in`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const plus = (d) => { const x = new Date(`${today}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const tomorrow = plus(1);

const A = session(), B = session(), OUT = session();

/* ---------------------------------- auth ---------------------------------- */
section("Authentication");
check("rejects a short password", (await A.post("/api/auth/signup", { name: "A", email: email("a"), password: "short" })).status === 422);
check("rejects a malformed email", (await A.post("/api/auth/signup", { name: "A", email: "nope", password: "password123" })).status === 422);

let r = await A.post("/api/auth/signup", { name: "Sarthak", email: email("a"), password: "password123" });
check("signs up", r.status === 200 && r.data?.user?.id, JSON.stringify(r.data).slice(0, 80));
check("refuses a duplicate email", (await session().post("/api/auth/signup", { name: "X", email: email("a"), password: "password123" })).status === 409);
check("refuses a wrong password", (await session().post("/api/auth/login", { email: email("a"), password: "wrongpassword" })).status === 401);
check("anonymous requests are rejected", (await session().get("/api/plan")).status === 401);

r = await A.get("/api/auth/me");
check("reports the signed-in user", r.data?.user?.name === "Sarthak");
check("reports no household yet", r.data?.household === null);

/* -------------------------------- household ------------------------------- */
section("Households");
r = await A.post("/api/households", { name: "E2E Flat", cookName: "Sunita ji" });
check("creates a flat", r.status === 201 && r.data?.household?.code?.length === 6);
const code = r.data.household.code;
check("join code avoids confusable characters", !/[O0I1L]/.test(code), code);

check("rejects a nonexistent join code", (await session().post("/api/households/join", { code: "ZZZZZZ" })).status === 401);
await B.post("/api/auth/signup", { name: "Khushi", email: email("b"), password: "password123" });
check("a flatmate joins with the code", (await B.post("/api/households/join", { code })).status === 200);

r = await A.get("/api/households/members");
check("lists both members", r.data?.members?.length === 2, `got ${r.data?.members?.length}`);

r = await A.patch("/api/households", { lunchLockAt: "11:15", cookOffDays: [0] });
check("saves kitchen settings", r.data?.household?.lunchLockAt === "11:15" && r.data.household.cookOffDays?.[0] === 0);
check("rejects a malformed lock time", (await A.patch("/api/households", { lunchLockAt: "25:99" })).status === 422);

/* --------------------------------- profile -------------------------------- */
section("Profile and targets");
r = await A.put("/api/profile", { sex: "male", age: 25, heightCm: 178, weightKg: 72, activityLevel: "moderate", goal: "gain", diet: "nonveg", allergies: ["prawns"] });
check("saves body stats", r.status === 200);
check("computes a calorie target", r.data?.targets?.calories > 2000, `${r.data?.targets?.calories}`);
check("computes a protein target from bodyweight", Math.abs(r.data.targets.protein_g - 72 * 1.7) < 2);
check("uses the male iron RDA", r.data.targets.iron_mg === 19);
await B.put("/api/profile", { sex: "female", age: 24, heightCm: 163, weightKg: 56, goal: "maintain", diet: "veg" });
r = await B.get("/api/profile");
check("uses the female iron RDA", r.data.targets.iron_mg === 29);
check("rejects an impossible age", (await A.put("/api/profile", { age: 900 })).status === 422);
check("saves notification preferences", (await A.put("/api/profile", { notifyMeals: false })).data?.profile?.notifyMeals === false);
await A.put("/api/profile", { notifyMeals: true });

/* ---------------------------------- dishes -------------------------------- */
section("Dish library");
r = await A.post("/api/dishes", { name: "Rajma Chawal", course: "lunch", baseServings: 4 });
check("creates a dish", r.status === 201);
const dishA = r.data.dish.id;
r = await A.post(`/api/dishes/${dishA}/enrich`);
check("AI fills in ingredients", r.status === 200 && r.data?.dish?.ingredients?.length > 4, `${r.data?.error ?? r.data?.dish?.ingredients?.length}`);
const ing = r.data?.dish?.ingredients ?? [];
check("marks pantry staples", ing.some((i) => i.isPantryStaple));
check("keeps units within the allowed set", ing.every((i) => ["g","kg","ml","l","tsp","tbsp","cup","piece","pinch","bunch","to taste"].includes(i.unit)));
check("estimates nutrition", (r.data?.dish?.nutrition?.calories ?? 0) > 0);
check("stores no null nutrients", Object.values(r.data?.dish?.nutrition ?? {}).every((v) => typeof v === "number"));

r = await B.get("/api/dishes");
check("the flatmate sees the same dish", r.data?.dishes?.some((d) => d.id === dishA));

r = await A.put(`/api/dishes/${dishA}/ingredients`, { ingredients: [{ name: "Rajma", quantity: 300, unit: "g", category: "pulses" }] });
check("ingredients can be edited by hand", r.data?.ingredients?.length === 1);
check("renames a dish", (await A.patch(`/api/dishes/${dishA}`, { name: "Rajma Chawal" })).status === 200);

r = await A.post("/api/dishes", { name: "Palak Paneer", course: "dinner", baseServings: 4 });
const dishB = r.data.dish.id;
await A.post(`/api/dishes/${dishB}/enrich`);

/* ----------------------------------- plan --------------------------------- */
section("Planning and voting");
r = await A.post("/api/plan", { date: tomorrow, slot: "lunch", dishId: dishA });
check("plans a dish", r.status === 201);
const entryA = r.data.entry.id;
check("refuses the same dish twice in a slot", (await A.post("/api/plan", { date: tomorrow, slot: "lunch", dishId: dishA })).status === 409);
check("rejects an invalid slot", (await A.post("/api/plan", { date: tomorrow, slot: "brunch", dishId: dishA })).status === 422);
check("rejects an invalid date", (await A.post("/api/plan", { date: "not-a-date", slot: "lunch", dishId: dishA })).status === 422);

r = await B.post("/api/plan", { date: tomorrow, slot: "lunch", dishId: dishB });
check("a second dish can contest the same slot", r.status === 201);
const entryB = r.data.entry.id;

r = await B.post(`/api/plan/${entryA}/vote`, { value: 1 });
check("a flatmate can vote", r.data?.upVotes === 2, `${r.data?.upVotes}`);
check("a downvote is recorded", (await A.post(`/api/plan/${entryB}/vote`, { value: -1 })).data?.downVotes === 1);
// The API is "set my vote to X"; 0 withdraws. The toggle-on-second-tap lives in the
// client, which sends 0 when you tap the vote you already gave.
check("sending 0 withdraws the vote", (await A.post(`/api/plan/${entryB}/vote`, { value: 0 })).data?.downVotes === 0);
check("re-sending the same value is idempotent", await (async () => {
  await A.post(`/api/plan/${entryB}/vote`, { value: -1 });
  return (await A.post(`/api/plan/${entryB}/vote`, { value: -1 })).data?.downVotes === 1;
})());
check("switching from down to up moves the vote rather than adding one", await (async () => {
  const r = await A.post(`/api/plan/${entryB}/vote`, { value: 1 });
  return r.data?.downVotes === 0 && r.data?.upVotes >= 1;
})());
check("rejects a nonsense vote value", (await A.post(`/api/plan/${entryA}/vote`, { value: 7 })).status === 422);

r = await A.post(`/api/plan/${entryA}/comments`, { body: "rajma again?" });
check("comments on a meal", r.status === 201);
check("rejects an empty comment", (await A.post(`/api/plan/${entryA}/comments`, { body: "   " })).status === 422);
check("reads the comment thread", (await B.get(`/api/plan/${entryA}/comments`)).data?.comments?.length === 1);

r = await A.get(`/api/plan?from=${tomorrow}&to=${tomorrow}`);
const lunch = r.data.entries.filter((e) => e.slot === "lunch");
check("both dishes are on the slot", lunch.length === 2);
check("vote tallies are returned", lunch.find((e) => e.id === entryA)?.upVotes === 2);
check("comment counts are returned", lunch.find((e) => e.id === entryA)?.commentCount === 1);
check("the winner is the most upvoted", [...lunch].sort((a, b) => b.upVotes - a.upVotes || a.createdAt.localeCompare(b.createdAt))[0].id === entryA);

check("a meal can move to another day", (await A.patch(`/api/plan/${entryB}`, { date: plus(2) })).data?.entry?.date === plus(2));

/* -------------------------------- nutrition ------------------------------- */
section("Nutrition summary");
r = await A.get(`/api/nutrition?date=${tomorrow}`);
check("summarises the day", r.status === 200 && r.data?.dishCount >= 1);
check("counts calories per person", (r.data?.perPerson?.calories ?? 0) > 0);
check("scores every member", r.data?.members?.length === 2);
check("only reports gaps for known nutrients", r.data.gaps.every((g) => typeof g.pctOfTarget === "number"));
check("rejects a bad date", (await A.get("/api/nutrition?date=nonsense")).status === 400);

/* --------------------------------- shopping ------------------------------- */
section("Shopping list");
await A.post("/api/shopping/clear");
r = await A.post("/api/shopping/generate", { from: tomorrow, to: tomorrow });
check("builds the list from the plan", r.status === 200 && r.data?.added > 0, JSON.stringify(r.data).slice(0, 90));
r = await B.get("/api/shopping");
const items = r.data.items;
check("the flatmate sees the same list", items.length > 0);
check("pantry staples are excluded", !items.some((i) => /^(salt|haldi|turmeric)$/i.test(i.name.trim())));
check("water never reaches the list", !items.some((i) => /^water/i.test(i.name.trim())));
check("no ingredient appears twice", new Set(items.map((i) => i.name.toLowerCase().replace(/\(.*?\)/g, "").trim())).size === items.length);

r = await B.post("/api/shopping", { name: "Doodh", quantity: 1, unit: "l", category: "dairy" });
check("adds an item by hand", r.status === 201);
const itemId = r.data.item.id;
check("ticks an item off", (await A.patch(`/api/shopping/${itemId}`, { checked: true })).data?.item?.checked === true);
check("records who ticked it", (await A.get("/api/shopping")).data.items.find((i) => i.id === itemId)?.checkedBy !== null);
check("clears only ticked items", (await A.post("/api/shopping/clear")).data?.removed === 1);
check("deletes an item", (await A.del(`/api/shopping/${(await A.get("/api/shopping")).data.items[0].id}`)).status === 200);

/* ----------------------------------- chat --------------------------------- */
section("Flat feed");
r = await A.get("/api/chat");
const beforeCount = r.data.messages.length;
check("plan activity appears in the feed", r.data.messages.some((m) => m.kind === "meal_added"));
r = await A.post("/api/chat", { body: "what's for lunch" });
check("posts a message", r.status === 201);
check("rejects an empty message", (await A.post("/api/chat", { body: "  " })).status === 422);
const cursor = (await B.get("/api/chat/cursor")).data.latest;
check("the cursor reports the latest id", typeof cursor === "number" && cursor > 0);
check("an up-to-date poll transfers nothing", (await B.get(`/api/chat?after=${cursor}`)).data.messages.length === 0);
r = await A.post("/api/chat", { body: "second message" });
check("an incremental poll returns only what is new", (await B.get(`/api/chat?after=${cursor}`)).data.messages.length === 1);
check("the flatmate sees the whole feed", (await B.get("/api/chat")).data.messages.length === beforeCount + 2);
check("removing a meal is recorded in the feed", await (async () => {
  await A.del(`/api/plan/${entryA}`);
  await new Promise((r) => setTimeout(r, 400));
  return (await A.get("/api/chat")).data.messages.some((m) => m.kind === "meal_removed");
})());

/* ---------------------------------- repeat -------------------------------- */
section("Repeat last week");
await A.post("/api/plan", { date: plus(-7), slot: "dinner", dishId: dishA });
r = await A.post("/api/plan/repeat", { days: 7 });
check("copies a week forward", r.status === 200 && typeof r.data.copied === "number", JSON.stringify(r.data).slice(0, 80));

/* ------------------------------ notifications ----------------------------- */
section("Push notifications");
r = await A.post("/api/push/subscribe", { endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${stamp}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=", auth: "tBHItJI5svbpez7KI4CCXg==" } });
check("registers a push subscription", r.status === 200 && r.data?.configured === true);
check("rejects a malformed subscription", (await A.post("/api/push/subscribe", { endpoint: "not-a-url", keys: { p256dh: "x", auth: "y" } })).status === 422);
check("unsubscribes", (await A.del("/api/push/subscribe")).status === 200);

/* ------------------------------------ AI ---------------------------------- */
section("AI suggestions");
r = await A.post("/api/ai/suggest", { date: plus(3), slot: "dinner" });
check("suggests meals", r.status === 200 && r.data?.suggestions?.length === 3, `${r.data?.error ?? r.data?.suggestions?.length}`);
const sugg = r.data?.suggestions ?? [];
check("every suggestion has a reason", sugg.every((s) => s.reason?.length > 5));
check("library ids are only ever real ones", sugg.every((s) => !s.existing_dish_id || [dishA, dishB].includes(s.existing_dish_id)));
check("respects the vegetarian in the flat", sugg.filter((s) => s.is_veg).length >= 2, `${sugg.filter((s) => s.is_veg).length}/3 veg`);
check("rejects a bad slot", (await A.post("/api/ai/suggest", { date: tomorrow, slot: "elevenses" })).status === 422);

/* --------------------------------- isolation ------------------------------ */
section("Cross-flat isolation");
await OUT.post("/api/auth/signup", { name: "Outsider", email: email("out"), password: "password123" });
await OUT.post("/api/households", { name: "Other Flat" });
check("cannot read another flat's dish", (await OUT.get(`/api/dishes/${dishA}`)).status === 404);
check("cannot delete another flat's dish", (await OUT.del(`/api/dishes/${dishA}`)).status === 404);
check("cannot vote in another flat", (await OUT.post(`/api/plan/${entryB}/vote`, { value: 1 })).status === 404);
check("cannot read another flat's comments", (await OUT.get(`/api/plan/${entryB}/comments`)).status === 404);
check("cannot see another flat's dishes", (await OUT.get("/api/dishes")).data.dishes.length === 0);
check("cannot see another flat's shopping list", (await OUT.get("/api/shopping")).data.items.length === 0);
check("cannot see another flat's feed", (await OUT.get("/api/chat")).data.messages.length === 0);
check("cannot see another flat's members", !(await OUT.get("/api/households/members")).data.members.some((m) => m.name === "Sarthak"));

/* ---------------------------------- logout -------------------------------- */
section("Sign out");
check("signs out", (await A.post("/api/auth/logout")).status === 200);
check("the session no longer works", (await A.get("/api/plan")).status === 401);

/* ---------------------------------- assets -------------------------------- */
section("PWA assets");
for (const [path, label] of [["/manifest.webmanifest", "manifest"], ["/sw.js", "service worker"], ["/icon-192.png", "icon"], ["/apple-touch-icon.png", "apple touch icon"]]) {
  const res = await fetch(`${BASE}${path}`);
  check(`${label} is served`, res.ok);
}
const sw = await (await fetch(`${BASE}/sw.js`)).text();
check("the service worker handles push", sw.includes('addEventListener("push"'));
check("the service worker handles notification taps", sw.includes('addEventListener("notificationclick"'));

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
if (failures.length) console.log("failed:\n  - " + failures.join("\n  - "));
process.exit(fail === 0 ? 0 : 1);
