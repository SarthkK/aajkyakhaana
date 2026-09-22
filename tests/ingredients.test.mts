import { canonicalIngredient, preferredLabel } from "../lib/ingredients.ts";

let pass = 0, fail = 0;
function same(a: string, b: string) {
  if (canonicalIngredient(a) === canonicalIngredient(b)) {
    pass++;
    console.log(`  ok   "${a}" == "${b}"  →  ${canonicalIngredient(a)}`);
  } else {
    fail++;
    console.log(`  FAIL "${a}" (${canonicalIngredient(a)}) != "${b}" (${canonicalIngredient(b)})`);
  }
}

function different(a: string, b: string) {
  if (canonicalIngredient(a) !== canonicalIngredient(b)) {
    pass++;
    console.log(`  ok   "${a}" != "${b}"`);
  } else {
    fail++;
    console.log(`  FAIL "${a}" wrongly merged with "${b}" → ${canonicalIngredient(a)}`);
  }
}

console.log("\npreparation is stripped");
same("Dhaniya", "chopped dhaniya");
same("Coriander leaves (for garnish)", "Dhaniya");
same("Onion", "Onions, finely chopped");
same("Tomato", "Tomatoes (roughly chopped)");
same("Potato", "Aloo, boiled and cubed");
same("Rajma (kidney beans), soaked overnight", "Kidney beans");
same("Ginger", "Adrak, grated");
same("Garlic", "Lehsun (minced)");

console.log("\nHindi and English are the same shopping trip");
same("Pyaaz", "Onion");
same("Palak", "Spinach");
same("Bhindi", "Lady finger");
same("Nimbu", "Lemon");
same("Dahi", "Curd");
same("Anda", "Eggs");
same("Hari mirch", "Green chillies");

console.log("\nbut genuinely different things stay apart");
different("Methi", "Kasuri methi");
different("Green chilli", "Red chilli powder");
different("Coriander", "Coriander powder");
different("Onion", "Spring onion");
different("Milk", "Coconut milk");
different("Rice", "Rice flour");
different("Ginger", "Ginger garlic paste");

console.log("\nthe label shown is the plainest spelling");
const label = preferredLabel(["Fresh dhaniya, finely chopped for garnish", "Dhaniya", "Coriander leaves (chopped)"]);
if (label === "Dhaniya") {
  pass++;
  console.log(`  ok   picked "${label}"`);
} else {
  fail++;
  console.log(`  FAIL picked "${label}"`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
