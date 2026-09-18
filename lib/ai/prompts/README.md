# Prompts

Every word sent to a language model lives in this folder. Nothing else in the codebase
contains prompt text, so this is the only place you need to look to change how the AI
behaves.

| File | What it drives |
|---|---|
| `kitchen-context.ts` | The shared framing prepended to every prompt — Indian kitchen assumptions, units, which masalas count as pantry staples. Edit this to change the app's "voice" everywhere at once. |
| `dish-details.ts` | Looking up a dish's ingredients and per-serving nutrition. |
| `suggest-meals.ts` | The "Ask AI" suggestions when nobody can decide. |

## How a prompt file is laid out

Each one exports three things, in this order:

1. **`SCHEMA`** — the JSON Schema the model must fill in. This is also the contract the
   rest of the app codes against, so changing a field name here means changing the
   TypeScript type next to it.
2. **`system(...)`** — the instructions: who the model is and the rules it must follow.
3. **`user(...)`** — the specific request, built from real data.

## Editing safely

- **Wording is free to change.** Rewrite `system()` and `user()` however you like.
- **Schema fields are not.** Renaming or removing a field in `SCHEMA` will break the
  code that reads it. Add fields freely; removing means updating the matching type.
- **Avoid `minItems` / `maxItems`.** Groq's JSON decoder rejects any schema containing
  them. Ask for a count in the prompt text instead.
- **Keep asking for JSON only.** Both providers are given the schema directly, but the
  instruction to avoid prose is what stops smaller models wrapping it in commentary.

After editing, check it still works:

```bash
npm run dev
# then add a dish in the UI, or:
curl -s -b cookies.txt -X POST localhost:3000/api/dishes/<id>/enrich | jq
```
