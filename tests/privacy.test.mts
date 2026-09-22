import { pseudonymise, restoreNames } from "../lib/privacy.ts";

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

const people = [
  { name: "Sarthk Kharwal", diet: "nonveg" },
  { name: "Khushi", diet: "veg" },
  { name: "Apeksha Dixit", diet: "nonveg" },
];
const { members, restore } = pseudonymise(people);

console.log("\nnothing identifying goes out");
check("every real name is replaced", members.every((m) => !/sarthk|khushi|apeksha/i.test(m.name)), JSON.stringify(members.map(m => m.name)));
check("aliases are distinct", new Set(members.map((m) => m.name)).size === 3);
check("the useful parts survive", members[1].diet === "veg");

console.log("\nand comes back on the way in");
const reply = "Person B is vegetarian, so let's do chana masala. Person A can add eggs, and Person C gets extra rice.";
const restored = restoreNames(reply, restore);
check("names are put back", restored.includes("Khushi") && restored.includes("Sarthk Kharwal") && restored.includes("Apeksha Dixit"), restored);
check("no alias is left behind", !/Person [A-F]/.test(restored), restored);
console.log(`  → ${restored}`);

console.log("\nedge cases");
check("text with no aliases is untouched", restoreNames("Make dal.", restore) === "Make dal.");
check("an ignored alias is harmless", !/Sarthk/.test(restoreNames("Flatmate 1 should eat more.", restore)));
const many = pseudonymise(Array.from({ length: 8 }, (_, i) => ({ name: `Person Number ${i}` })));
check("more people than aliases still works", new Set(many.members.map((m) => m.name)).size === 8);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
