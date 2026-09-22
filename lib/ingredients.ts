/**
 * Reducing an ingredient as written to the thing you actually buy.
 *
 * Recipes name the same item many ways — "Dhaniya", "chopped dhaniya", "Coriander
 * leaves (for garnish)", "fresh coriander, finely chopped" — and each one used to
 * become its own line on the shopping list. Nobody buys coriander four times.
 *
 * The rule throughout is to strip *preparation* and keep *identity*. "Chopped" does
 * not change what you buy; "dried" does — kasuri methi is not fresh methi, and red
 * chilli powder is not a green chilli. When in doubt, leave it alone: two lines on a
 * list is a small annoyance, merging two genuinely different things is a wrong list.
 */

/** How the item was prepared. None of these change what you put in the basket. */
const PREPARATION = [
  "chopped", "finely chopped", "roughly chopped", "coarsely chopped",
  "diced", "cubed", "sliced", "thinly sliced", "julienned", "shredded",
  "grated", "minced", "crushed", "ground", "mashed", "pureed", "blended",
  "boiled", "parboiled", "soaked", "overnight soaked", "pre-soaked",
  "roasted", "toasted", "fried", "sauteed", "sautéed", "steamed", "blanched",
  "washed", "cleaned", "rinsed", "peeled", "deseeded", "de-seeded", "trimmed",
  "halved", "quartered", "slit", "torn", "broken", "whole", "cut",
  "beaten", "whisked", "melted", "softened", "room temperature", "cold", "warm",
  "optional", "as needed", "as required", "to taste", "or more", "plus extra",
];

/** Phrases describing what it is *for*, which never change the item. */
const PURPOSE = /\b(for|to)\s+(garnish|garnishing|tempering|tadka|frying|deep frying|shallow frying|serving|serve|marination|marinating|dough|kneading|cooking|topping|seasoning|sprinkling|drizzling|greasing)\b.*$/;

/**
 * Names for the same thing. Only entries that are genuinely interchangeable in a
 * kitchen — deliberately not "methi"/"kasuri methi" or "mirch"/"mirch powder".
 */
const SYNONYMS: Record<string, string> = {
  dhaniya: "coriander", dhania: "coriander", kothmir: "coriander", cilantro: "coriander",
  "coriander leaves": "coriander", "coriander leaf": "coriander", "hara dhaniya": "coriander",
  pyaaz: "onion", pyaz: "onion", kanda: "onion",
  tamatar: "tomato", tomatoes: "tomato",
  adrak: "ginger",
  lehsun: "garlic", lasun: "garlic", lahsun: "garlic",
  aloo: "potato", potatoes: "potato", batata: "potato",
  palak: "spinach",
  bhindi: "okra", "lady finger": "okra", "ladies finger": "okra",
  gobhi: "cauliflower", gobi: "cauliflower", phoolgobi: "cauliflower",
  matar: "peas", mutter: "peas", "green peas": "peas",
  gajar: "carrot", carrots: "carrot",
  nimbu: "lemon", "lemon juice": "lemon", limbu: "lemon",
  dahi: "curd", yoghurt: "curd", yogurt: "curd",
  doodh: "milk",
  makhan: "butter",
  namak: "salt",
  cheeni: "sugar", chini: "sugar", shakkar: "sugar",
  atta: "wheat flour", "whole wheat flour": "wheat flour", "gehun ka atta": "wheat flour",
  maida: "refined flour", "all purpose flour": "refined flour", "all-purpose flour": "refined flour",
  chawal: "rice", "basmati rice": "rice",
  rajma: "kidney beans", "kabuli chana": "chickpeas", chole: "chickpeas", chana: "chickpeas",
  "green chillies": "green chilli", "green chili": "green chilli", "hari mirch": "green chilli",
  "green chilies": "green chilli", "green chillis": "green chilli",
  paneer: "paneer", "cottage cheese": "paneer",
  "cooking oil": "oil", "vegetable oil": "oil", "refined oil": "oil", tel: "oil",
  jeera: "cumin", "cumin seeds": "cumin", "jeera seeds": "cumin",
  haldi: "turmeric", "turmeric powder": "turmeric", "haldi powder": "turmeric",
  eggs: "egg", anda: "egg", ande: "egg",
  methi: "fenugreek leaves", "methi leaves": "fenugreek leaves",
  "kasuri methi": "dried fenugreek", "kasoori methi": "dried fenugreek",
  baingan: "brinjal", eggplant: "brinjal", aubergine: "brinjal",
  lauki: "bottle gourd", ghiya: "bottle gourd",
  karela: "bitter gourd", kerela: "bitter gourd",
  shimla: "capsicum", "shimla mirch": "capsicum", "bell pepper": "capsicum",
  soyabeen: "soya", soyabean: "soya", "soya chunks": "soya",
};

/** Plurals English does not form by adding an s. */
const IRREGULAR_PLURALS: Record<string, string> = {
  chillies: "chilli", chilies: "chilli", chilis: "chilli", chillis: "chilli",
  leaves: "leaf", loaves: "loaf", knives: "knife",
  potatoes: "potato", tomatoes: "tomato", mangoes: "mango",
  // Naturally plural — singularising these produces words nobody uses.
  peas: "peas", oats: "oats", greens: "greens", chickpeas: "chickpeas", sprouts: "sprouts",
};

/**
 * Singular form, so "Onion" and "Onions" reach the same key.
 *
 * Deliberately crude: it only has to be *consistent*, not linguistically right. Both
 * spellings landing on the same string is the whole requirement.
 */
function singular(word: string): string {
  return word
    .split(" ")
    .map((part) => {
      if (IRREGULAR_PLURALS[part]) return IRREGULAR_PLURALS[part];
      if (part.length > 3 && part.endsWith("ies")) return `${part.slice(0, -3)}y`;
      if (part.length > 3 && /(s|x|z|ch|sh)es$/.test(part)) return part.slice(0, -2);
      if (part.length > 3 && part.endsWith("s") && !part.endsWith("ss")) return part.slice(0, -1);
      return part;
    })
    .join(" ");
}

/** Synonyms keyed and valued in singular form, so a lookup always lands. */
const SYNONYM_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(SYNONYMS).map(([key, value]) => [singular(key), singular(value)]),
);

/**
 * The comparison key for an ingredient. Two names producing the same key are the same
 * thing on a shopping list.
 */
export function canonicalIngredient(raw: string): string {
  let name = raw.toLowerCase().trim();

  // "Coriander (for garnish)" and anything else in brackets.
  name = name.replace(/\(.*?\)/g, " ");

  // Everything after a comma is almost always preparation: "onion, finely chopped".
  name = name.replace(/,.*$/, " ");

  // "for garnish", "to serve".
  name = name.replace(PURPOSE, " ");

  // Strip preparation words wherever they appear, longest first so "finely chopped"
  // goes before "chopped".
  for (const word of [...PREPARATION].sort((a, b) => b.length - a.length)) {
    name = name.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }

  name = name.replace(/\s+/g, " ").trim();
  // A trailing "and" or "or" left behind by the stripping above.
  name = name.replace(/\s+(and|or|with)$/, "").trim();

  name = singular(name);
  return SYNONYM_LOOKUP[name] ?? name;
}

/**
 * Which of several spellings to show on the list.
 *
 * The shortest wins, because that is almost always the plain name — "Dhaniya" over
 * "Fresh dhaniya, finely chopped for garnish" — with ties broken by what came first
 * so the result is stable.
 */
export function preferredLabel(names: string[]): string {
  return names.reduce((best, name) => {
    const clean = name.replace(/\(.*?\)/g, "").replace(/,.*$/, "").trim();
    const bestClean = best.replace(/\(.*?\)/g, "").replace(/,.*$/, "").trim();
    return clean.length && clean.length < bestClean.length ? name : best;
  }, names[0]);
}
