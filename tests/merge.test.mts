import { mergeItems } from "../lib/shopping.ts";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

const same = mergeItems([
  { name: "Onion", quantity: 500, unit: "g", category: "produce" },
  { name: "Onion", quantity: 1, unit: "kg", category: "produce" },
]);
check("same unit family adds up and scales", same.map(i => `${i.quantity} ${i.unit}`), ["1.5 kg"]);

const mixed = mergeItems([
  { name: "Onion", quantity: 2, unit: "piece", category: "produce" },
  { name: "Onion", quantity: 200, unit: "g", category: "produce" },
]);
check("mixed units collapse to one row", mixed.length, 1);
check("mixed units keep the remainder in a note", `${mixed[0].quantity} ${mixed[0].unit} ${mixed[0].note}`, "2 piece + 200 g");

const parens = mergeItems([
  { name: "Palak (spinach)", quantity: 300, unit: "g", category: "produce" },
  { name: "Palak", quantity: 200, unit: "g", category: "produce" },
]);
check("bracketed aliases merge", parens.map(i => `${i.quantity} ${i.unit}`), ["500 g"]);

const taste = mergeItems([{ name: "Salt", quantity: null, unit: "to taste", category: "spices" }]);
check("to-taste items survive without a quantity", [taste.length, taste[0].quantity], [1, null]);

const spoons = mergeItems([
  { name: "Jeera", quantity: 3, unit: "tsp", category: "spices" },
  { name: "Jeera", quantity: 1, unit: "tbsp", category: "spices" },
]);
check("tsp and tbsp are one family", spoons.map(i => `${i.quantity} ${i.unit}`), ["2 tbsp"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
