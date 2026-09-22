/* The pantry, the ingredient reconciliation, and the multi-day planner. */
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

const A = client();
await A("POST", "/api/auth/signup", { name: "Pantry", email: `p-${stamp}@test.in`, password: "password123" });
await A("POST", "/api/households", { name: "Pantry Flat" });

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const day = (n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

console.log("\nIngredient reconciliation");
const d1 = (await A("POST", "/api/dishes", { name: "Jeera Aloo" })).data.dish.id;
await A("PUT", `/api/dishes/${d1}/ingredients`, { ingredients: [
  { name: "Dhaniya", quantity: 50, unit: "g", category: "produce" },
  { name: "Pyaaz", quantity: 2, unit: "piece", category: "produce" },
]});
const d2 = (await A("POST", "/api/dishes", { name: "Bhindi Masala" })).data.dish.id;
await A("PUT", `/api/dishes/${d2}/ingredients`, { ingredients: [
  { name: "Chopped dhaniya (for garnish)", quantity: 20, unit: "g", category: "produce" },
  { name: "Onions, finely chopped", quantity: 150, unit: "g", category: "produce" },
]});

// Tomorrow's dinner is not locked, so it is shoppable.
await A("POST", "/api/plan", { date: day(1), slot: "dinner", dishId: d1 });
await A("POST", "/api/plan", { date: day(1), slot: "lunch", dishId: d2 });
await A("POST", "/api/shopping/clear");
let r = await A("POST", "/api/shopping/generate", { from: day(1), to: day(1) });
let items = (await A("GET", "/api/shopping")).data.items;
const names = items.map((i) => i.name.toLowerCase());
check("dhaniya and chopped dhaniya are one line", names.filter((n) => n.includes("dhaniya") || n.includes("coriander")).length === 1, JSON.stringify(names));
check("their quantities add up", items.some((i) => /dhaniya|coriander/i.test(i.name) && Number(i.quantity) === 70), JSON.stringify(items.map(i => `${i.name} ${i.quantity}${i.unit}`)));
check("pyaaz and onions are one line", names.filter((n) => n.includes("pyaaz") || n.includes("onion")).length === 1, JSON.stringify(names));

console.log("\nTicking off stocks the pantry");
const dhaniya = items.find((i) => /dhaniya|coriander/i.test(i.name));
await A("PATCH", `/api/shopping/${dhaniya.id}`, { checked: true });
let pantry = (await A("GET", "/api/pantry")).data.items;
check("what you bought is in the pantry", pantry.some((p) => /dhaniya|coriander/i.test(p.name)), JSON.stringify(pantry.map(p => p.name)));
check("with the quantity you bought", pantry.find((p) => /dhaniya|coriander/i.test(p.name))?.quantity === 70);
await A("PATCH", `/api/shopping/${dhaniya.id}`, { checked: false });
pantry = (await A("GET", "/api/pantry")).data.items;
check("unticking takes it back out", !pantry.some((p) => /dhaniya|coriander/i.test(p.name)), JSON.stringify(pantry.map(p => p.name)));

console.log("\nThe list only asks for what is missing");
await A("POST", "/api/pantry", { name: "Dhaniya", quantity: 500, unit: "g" });
await A("POST", "/api/shopping/clear");
for (const i of (await A("GET", "/api/shopping")).data.items) await A("DELETE", `/api/shopping/${i.id}`);
r = await A("POST", "/api/shopping/generate", { from: day(1), to: day(1) });
check("a fully stocked ingredient is skipped", (r.data.alreadyHave ?? []).some((n) => /dhaniya|coriander/i.test(n)), JSON.stringify(r.data));
items = (await A("GET", "/api/shopping")).data.items;
check("and does not appear on the list", !items.some((i) => /dhaniya|coriander/i.test(i.name)), JSON.stringify(items.map(i => i.name)));

await A("POST", "/api/pantry", { name: "Onion", quantity: 100, unit: "g" });
await A("POST", "/api/shopping/clear");
for (const i of (await A("GET", "/api/shopping")).data.items) await A("DELETE", `/api/shopping/${i.id}`);
await A("POST", "/api/shopping/generate", { from: day(1), to: day(1) });
items = (await A("GET", "/api/shopping")).data.items;
const onion = items.find((i) => /onion|pyaaz/i.test(i.name));
check("a partly stocked one asks only for the shortfall", onion && Number(onion.quantity) < 150, onion ? `${onion.quantity}${onion.unit}` : "missing");

console.log("\nSettled meals are not shopped for");
await A("POST", "/api/plan", { date: day(-1), slot: "dinner", dishId: d1 });
await A("POST", "/api/shopping/clear");
for (const i of (await A("GET", "/api/shopping")).data.items) await A("DELETE", `/api/shopping/${i.id}`);
r = await A("POST", "/api/shopping/generate", { from: day(-1), to: day(-1) });
check("a meal in the past yields nothing to buy", r.data.added === 0 && r.data.settledMeals >= 1, JSON.stringify(r.data));

console.log("\nCooking takes ingredients back out");
await A("POST", "/api/pantry", { name: "Dhaniya", quantity: 500, unit: "g" });
const before = (await A("GET", "/api/pantry")).data.items.find((p) => /dhaniya|coriander/i.test(p.name))?.quantity;
const entry = (await A("GET", `/api/plan?from=${day(1)}&to=${day(1)}`)).data.entries.find((e) => e.dish.name === "Jeera Aloo");
await A("PATCH", `/api/plan/${entry.id}`, { status: "cooked" });
const after = (await A("GET", "/api/pantry")).data.items.find((p) => /dhaniya|coriander/i.test(p.name))?.quantity;
check("stock drops when a meal is cooked", after !== undefined && after < before, `${before} -> ${after}`);

console.log("\nThe multi-day planner");
r = await A("POST", "/api/chat/plan", { days: 3, slots: ["breakfast", "lunch", "dinner"] });
check("plans several days", r.status === 201, `${r.data?.error ?? ""}`);
const added = r.data?.added ?? [];
check("fills multiple days", new Set(added.map((m) => m.date)).size >= 2, `${new Set(added.map((m) => m.date)).size} days`);
check("does not repeat a dish", new Set(added.map((m) => m.dish)).size === added.length, JSON.stringify(added.map(m => m.dish)));
check("leaves already-decided slots alone", !added.some((m) => m.date === day(1) && m.slot === "dinner"));
check("explains itself in the chat", typeof r.data?.summary === "string" && r.data.summary.length > 20);
console.log(`  → ${r.data?.summary?.slice(0, 130)}`);
for (const m of added.slice(0, 6)) console.log(`    ${m.date} ${m.slot}: ${m.dish}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
