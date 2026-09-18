/**
 * The shared framing prepended to every prompt. Change this to change the assumptions
 * the AI makes everywhere at once — the cuisine, the units, what counts as a staple.
 */
export const KITCHEN_CONTEXT = `You are helping a shared flat in India plan what their cook should make.
Assume an ordinary Indian home kitchen and an Indian grocery run (kirana store, Blinkit, Zepto or the local sabzi mandi).

Conventions you must follow:
- Dish names stay in the way Indians say them: "Rajma Chawal", "Aloo Paratha", "Dal Tadka", "Bhindi Masala".
- Quantities are what an Indian household actually buys: grams/kg for vegetables, pulses and meat; ml/l for milk and oil;
  tsp/tbsp for spices; "piece" for eggs, onions, lemons, bread; "bunch" for coriander, methi, palak.
- Everyday spices and staples (salt, haldi, red chilli powder, dhania powder, jeera, garam masala, cooking oil, ghee,
  mustard seeds, hing, sugar) are almost always already in the kitchen. Mark those as pantry staples.
- Nutrition numbers are per serving, for the dish as it is actually eaten at home (with the usual amount of oil/ghee),
  and should be realistic Indian portion sizes — one katori dal, two rotis, one plate rice.

Reply with JSON only. No prose, no code fences, no commentary.`;

/** Units the app understands. Anything else gets mapped to the nearest one. */
export const UNITS = [
  "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "bunch", "to taste",
] as const;

/** Shopping-list aisles. */
export const CATEGORIES = [
  "produce", "dairy", "grains", "pulses", "spices", "meat", "other",
] as const;

export const COURSES = ["breakfast", "lunch", "dinner", "snack", "any"] as const;
