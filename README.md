# Kya Khaana 🍲

A web app for flats with a cook. Decide what to eat today and tomorrow, vote on it,
argue about it in the comments, and turn the plan into a grocery list — without a
daily debate in the group chat.

Built as a **PWA**, so nobody has to install anything: open it on a phone and use
*Add to Home Screen*. It then behaves like an app, full screen, with its own icon.

## What it does

| | |
|---|---|
| **Today & tomorrow first** | The home screen is only those two days. The calendar goes two weeks out when you need it. |
| **Dish library** | Add a dish by name. Ingredients and per-serving nutrition are fetched by a free AI model in a couple of seconds, and everything stays editable afterwards. |
| **Voting** | Anyone adds a meal to breakfast / lunch / dinner; everyone else gives it a 👍 or 👎. |
| **Comments** | Per meal, so "rajma again?" lands in the right place. |
| **Flats** | One flat = one group. Share the 6-character code and flatmates join. |
| **Shared shopping list** | Add things by hand, or generate it from the week's plan — quantities merged across dishes, pantry staples skipped. |
| **AI suggestions** | When nobody has decided, it proposes three dishes that fit what the flat eats, what they ate recently, allergies, and where the week's nutrition is falling short. |
| **Macros & micros** | Everyone enters age, sex, height, weight, activity and goal. The app computes daily calorie, protein and micronutrient targets (ICMR-NIN 2020 RDAs) and shows how the day's plan measures up. |

## Running it locally

**1. Postgres.** Any Postgres 14+ will do. With Docker:

```bash
docker run -d --name kyakhaana-db \
  -e POSTGRES_PASSWORD=kyakhaana -e POSTGRES_USER=kyakhaana -e POSTGRES_DB=kyakhaana \
  -p 55432:5432 postgres:17-alpine
```

**2. Environment.** Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
openssl rand -base64 48        # paste this as JWT_SECRET
```

**3. Create the tables and start:**

```bash
npm install
npm run db:push     # creates the schema
npm run dev
```

The app builds without any environment variables — the database connects on first
query, not on import — so `npm run build` works on a fresh clone. It will of course
refuse to serve a request until `DATABASE_URL` is set.

Open http://localhost:3000.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:push` | Push the schema straight to the database (what you want in development) |
| `npm run db:generate` | Write a versioned SQL migration into `drizzle/` |
| `npm run db:studio` | Browse the data in a GUI |

## Live deployment

| | |
|---|---|
| App | https://aajkyakhaana.vercel.app |
| Hosting | Vercel, functions pinned to `sin1` (Singapore) |
| Database | Neon project `aajkyakhaana-sg`, Singapore, Postgres 18 |
| Production DB | `main` branch — what the live site uses |
| Development DB | `dev` branch — used by preview deploys **and** local `npm run dev` |

Production and development have separate `JWT_SECRET`s, so a session from one is not
valid on the other. Pushing to `main` on GitHub redeploys production; every other
branch gets a preview deployment pointed at the `dev` database.

To reset the dev database without touching production, delete and recreate the branch:

```bash
npx neonctl branches delete dev --project-id bitter-fog-01343191
npx neonctl branches create --project-id bitter-fog-01343191 --name dev
DATABASE_URL="$(npx neonctl connection-string dev --project-id bitter-fog-01343191 --pooled)" \
  npx drizzle-kit push --force
```

## Deploying it yourself


**Database — [Neon](https://neon.tech).** Create a project, copy the **pooled**
connection string (it has `-pooler` in the host). Keep `?sslmode=require`.

**App — [Vercel](https://vercel.com).** Import the repo and set three environment
variables: `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`. Then run the schema
push once against the Neon database from your own machine:

```bash
DATABASE_URL="<your neon url>" npx drizzle-kit push
```

Both free tiers are comfortably enough for a few flats.

## The AI bits

Ingredient lookup, nutrition estimates and meal suggestions all go through one small
provider wrapper (`lib/ai/client.ts`).

**Default provider: [Groq](https://console.groq.com/keys)** — free, no credit card,
and far and away the most generous free tier available.

| | |
|---|---|
| Default model | `qwen/qwen3.8-27b` |
| Falls back to | `openai/gpt-oss-120b`, then `openai/gpt-oss-20b` |
| Free limits | 30 requests/minute, **14,400/day** |
| Typical latency | 2–4s for a dish lookup |
| Cost | ₹0 |

Set `GROQ_API_KEY` and you are done. Swap models with `GROQ_MODEL` and `GROQ_FALLBACKS`.

**Alternatives**, switched with `AI_PROVIDER`:

- `openrouter` — also free, but **50 requests/day** and its free capacity is shared, so
  calls are throttled often. It also requires turning on *"Enable free endpoints that
  may train on inputs"* at
  [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy), or every
  call fails with a confusing 404 (the app detects this and says so).
- `anthropic` — paid, best answers.

Providers were compared rather than assumed. Groq and OpenRouter both expose an
OpenAI-compatible API, so they share one code path in `lib/ai/client.ts` and differ
only in base URL, key and model names.

**Free-tier prompts may be used for training**, on Groq and OpenRouter alike, so
**flatmates' names are stripped before anything leaves the server** — the model sees
"Flatmate 1: veg, goal gain, allergic to peanuts". Nobody's age, height or weight is
ever sent; only diet, goal, allergies, dislikes, dish names and how far off the day's
nutrition targets are.

A request is spent only when you add a *new* dish, refetch its ingredients, or press
"Ask AI". Everyday voting, planning and shopping cost nothing.

### Three things learned the hard way about free models

These are why `lib/ai/client.ts` looks the way it does. All of them were found by
actually calling the models, not by reading docs.

1. **Structured outputs, not tool calling.** Asked to call a tool, several free models
   either ignore it or "call" it with an empty argument object. The same models fill in
   a `response_format: json_schema` reliably. Switching cut a broken 46-second call down
   to a working 2.6-second one.
2. **Turn thinking off.** Hybrid-reasoning models spend their whole budget reasoning
   about a task this mechanical. `reasoning: { enabled: false }` took one dish lookup
   from 90 seconds (and a truncated answer) to 2 seconds.
3. **Free capacity is shared, and a busy endpoint queues rather than refusing.**
   OpenRouter's own fallback list only engages on an *error*, so a merely-slow model is
   waited on until the hosting platform kills the request. The app therefore times each
   attempt out itself (15s) and moves to a different model, with all attempts sharing
   one 50s budget so the whole thing fits inside Vercel's 60s function limit.
4. **The same parameter has different names per provider.** Groq rejects OpenRouter's
   `reasoning: {enabled:false}` outright and wants `reasoning_effort: "none"`; Groq's
   JSON decoder also rejects a schema containing `minItems`/`maxItems`. Both are sent
   conditionally.

Also worth knowing: OpenRouter writes SSE keep-alive comments into the body of slow
non-streaming responses, so the body has to be cleaned before `JSON.parse`. And the
model's `is_pantry_staple` flag is unreliable, so common masalas are recognised
server-side — otherwise salt and haldi end up on the weekly shopping list.

Swap models with `OPENROUTER_MODEL` and `OPENROUTER_FALLBACKS` (comma separated) —
anything from [the free list](https://openrouter.ai/models?max_price=0). OpenRouter
allows at most three models in the routing list.

**Want better answers and don't mind paying?** Set `AI_PROVIDER="anthropic"` and
`ANTHROPIC_API_KEY`. Nothing else changes.

**Without any key, everything else still works** — you add ingredients by hand on the
dish screen, and the "Ask AI" button says it is not configured. Nothing crashes and no
data is lost. Rate limits, bad keys and models that return junk all surface as a plain
message you can act on.

Prompts are written for Indian home cooking: dish names as people actually say them,
quantities in the units an Indian grocery run uses, and everyday masalas treated as
things already in the kitchen.

## How it is put together

```
app/
  (app)/            the signed-in, tab-bar part of the app
    today/          today + tomorrow — the main screen
    plan/           two-week calendar
    day/[date]/     one full day
    dishes/         dish library and the per-dish editor
    shopping/       shared list
    me/             your body stats, diet, and the flat's code and members
  api/              every REST endpoint
  login/ signup/ welcome/
components/         UI pieces (bottom sheets, cards, the day board, voting)
lib/
  db/schema.ts      the whole data model
  ai/               prompts and structured-output calls
  nutrition.ts      BMR/TDEE and the RDA targets
  summary.ts        what a day's plan adds up to per person
  shopping.ts       merging ingredients into list lines
```

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM ·
Postgres · Groq. Auth is email + password (bcrypt) with a signed JWT in an
httpOnly cookie — no third-party auth service to sign up for.

Hosting, database and AI are all on free tiers, so running this costs nothing.

### A few decisions worth knowing

- **Dates are plain `YYYY-MM-DD` strings** in the flat's timezone (`Asia/Kolkata` by
  default), never timestamps. "Today" means today where the flat is, not where the
  server is.
- **Nutrition is stored per serving on the dish**, and a day's total assumes each
  person eats one serving of everything planned. That is deliberately rough — it is a
  planning signal, not a food diary.
- **A nutrient no planned dish has data for is treated as unknown**, not as a
  shortfall, so the gap list stays honest.
- **Every household-scoped query filters by household id**, so a flat can only ever
  see its own dishes, plans and list.
