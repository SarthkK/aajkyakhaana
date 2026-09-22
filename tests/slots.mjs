/*
 * One meal per slot.
 *
 * Proposing three dinners and voting for one does not mean the flat eats three dinners.
 * The day summary and the shopping list both used to count every proposal that was not
 * explicitly cancelled — and nothing ever sets "cancelled" on its own — so a flat that
 * argued about its food looked like it ate twice as much as it did, and the grocery list
 * bought for dishes that lost.
 *
 * No AI here: dish names and ingredients are set by hand so this is deterministic.
 */
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

/** /api/shopping/clear only removes what is ticked off, so start from actually empty. */
async function wipeList(c) {
  for (const i of (await c("GET", "/api/shopping")).data.items) await c("DELETE", `/api/shopping/${i.id}`);
}

// Two flatmates, because proposing a dish already upvotes it for whoever proposed it —
// one person can never break their own tie.
const A = client(), K = client();
await A("POST", "/api/auth/signup", { name: "Slots", email: `s1-${stamp}@test.in`, password: "password123" });
const flat = await A("POST", "/api/households", { name: "Slots Flat" });
await K("POST", "/api/auth/signup", { name: "Khushi", email: `s2-${stamp}@test.in`, password: "password123" });
await K("POST", "/api/households/join", { code: flat.data.household.code });

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const day = (n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const when = day(1); // tomorrow: nothing is locked yet

console.log("\nA contested slot is still one meal");
const rajma = (await A("POST", "/api/dishes", { name: "Rajma Chawal" })).data.dish.id;
const chole = (await A("POST", "/api/dishes", { name: "Chole Bhature" })).data.dish.id;
const poha = (await A("POST", "/api/dishes", { name: "Poha" })).data.dish.id;

await A("PUT", `/api/dishes/${rajma}/ingredients`, { ingredients: [
  { name: "Rajma", quantity: 300, unit: "g", category: "pulses" },
]});
await A("PUT", `/api/dishes/${chole}/ingredients`, { ingredients: [
  { name: "Kabuli chana", quantity: 400, unit: "g", category: "pulses" },
]});

const e1 = (await A("POST", "/api/plan", { date: when, slot: "dinner", dishId: rajma })).data.entry.id;
const e2 = (await A("POST", "/api/plan", { date: when, slot: "dinner", dishId: chole })).data.entry.id;

let sum = (await A("GET", `/api/nutrition?date=${when}`)).data;
check("two dinners proposed still counts as one meal", sum.dishCount === 1, `dishCount ${sum.dishCount}`);

await A("POST", "/api/plan", { date: when, slot: "breakfast", dishId: poha });
sum = (await A("GET", `/api/nutrition?date=${when}`)).data;
check("a second slot counts separately", sum.dishCount === 2, `dishCount ${sum.dishCount}`);

console.log("\nThe winner is what the votes say");
check("proposing a dish upvotes it for the proposer", (await A("GET", `/api/plan?from=${when}&to=${when}`)).data.entries.every((e) => e.upVotes === 1));

await K("POST", `/api/plan/${e2}/vote`, { value: 1 });
let entries = (await A("GET", `/api/plan?from=${when}&to=${when}`)).data.entries;
check("a flatmate's vote puts one ahead", entries.find((e) => e.id === e2)?.upVotes === 2, JSON.stringify(entries.map((e) => `${e.dish.name} ${e.upVotes}`)));
sum = (await A("GET", `/api/nutrition?date=${when}`)).data;
check("voting does not add a meal", sum.dishCount === 2, `dishCount ${sum.dishCount}`);

console.log("\nShopping buys for the winner only");
await wipeList(A);
await A("POST", "/api/shopping/generate", { from: when, to: when });
let names = (await A("GET", "/api/shopping")).data.items.map((i) => i.name.toLowerCase());
check("the winning dish's ingredients are on the list", names.some((n) => n.includes("chana")), JSON.stringify(names));
check("the losing dish's are not", !names.some((n) => n.includes("rajma")), JSON.stringify(names));

console.log("\nThe other dish wins once the votes move");
// Back to one each: a tie goes to whatever was proposed first, which is Rajma Chawal.
await K("POST", `/api/plan/${e2}/vote`, { value: 0 });
await wipeList(A);
await A("POST", "/api/shopping/generate", { from: when, to: when });
names = (await A("GET", "/api/shopping")).data.items.map((i) => i.name.toLowerCase());
check("the new winner is shopped for", names.some((n) => n.includes("rajma")), JSON.stringify(names));
check("the old one is dropped", !names.some((n) => n.includes("chana")), JSON.stringify(names));

console.log("\nCancelling still removes a meal entirely");
await A("PATCH", `/api/plan/${e1}`, { status: "cancelled" });
await A("PATCH", `/api/plan/${e2}`, { status: "cancelled" });
sum = (await A("GET", `/api/nutrition?date=${when}`)).data;
check("a slot with everything cancelled is not counted", sum.dishCount === 1, `dishCount ${sum.dishCount}`);

console.log("\nThe pantry is editable");
await A("POST", "/api/pantry", { name: "Rajma", quantity: 500, unit: "g" });
let pantry = (await A("GET", "/api/pantry")).data.items;
const shelf = pantry.find((p) => /rajma/i.test(p.name));
check("added by hand", Boolean(shelf), JSON.stringify(pantry.map((p) => p.name)));

let res = await A("PATCH", `/api/pantry/${shelf.id}`, { name: "Rajma (kashmiri)", quantity: 2, unit: "kg", category: "pulses" });
check("name, amount and unit all save", res.status === 200, JSON.stringify(res.data));
check("a new unit is converted to the base one", res.data.item.quantity === 2000 && res.data.item.unit === "g", JSON.stringify(res.data.item));
check("the new name sticks", res.data.item.name === "Rajma (kashmiri)", res.data.item.name);

await A("POST", "/api/pantry", { name: "Dhaniya", quantity: 100, unit: "g" });
const dhaniya = (await A("GET", "/api/pantry")).data.items.find((p) => /dhaniya|coriander/i.test(p.name));
await A("POST", "/api/pantry", { name: "Pyaaz", quantity: 3, unit: "piece" });
res = await A("PATCH", `/api/pantry/${dhaniya.id}`, { name: "Coriander" });
check("renaming onto an existing shelf merges rather than failing", res.status === 200, JSON.stringify(res.data));

res = await A("PATCH", `/api/pantry/${shelf.id}`, { quantity: 0 });
check("setting it to zero clears the shelf", res.data.item === null, JSON.stringify(res.data));
pantry = (await A("GET", "/api/pantry")).data.items;
check("and it is gone from the list", !pantry.some((p) => p.id === shelf.id));

console.log("\nShopping lines are editable");
await A("POST", "/api/shopping", { name: "Doodh", quantity: 1, unit: "l", category: "dairy" });
const milk = (await A("GET", "/api/shopping")).data.items.find((i) => /doodh/i.test(i.name));
res = await A("PATCH", `/api/shopping/${milk.id}`, { name: "Doodh (toned)", quantity: 2, unit: "l", category: "dairy", note: "Amul taza" });
check("name, amount, unit and note all save", res.status === 200, JSON.stringify(res.data));
const saved = (await A("GET", "/api/shopping")).data.items.find((i) => i.id === milk.id);
check("and come back on the list", saved.name === "Doodh (toned)" && Number(saved.quantity) === 2 && saved.note === "Amul taza", JSON.stringify(saved));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
