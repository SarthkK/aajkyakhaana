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
| **Dish library** | Add a dish by name. Ingredients and per-serving nutrition are fetched by a free AI model, and everything stays editable afterwards. |
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

Open http://localhost:3000.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:push` | Push the schema straight to the database (what you want in development) |
| `npm run db:generate` | Write a versioned SQL migration into `drizzle/` |
| `npm run db:studio` | Browse the data in a GUI |

## Deploying it for free

**Database — [Neon](https://neon.tech).** Create a project, copy the **pooled**
connection string (it has `-pooler` in the host). Keep `?sslmode=require`.

**App — [Vercel](https://vercel.com).** Import the repo and set three environment
variables: `DATABASE_URL`, `JWT_SECRET`, `OPENROUTER_API_KEY`. Then run the schema
push once against the Neon database from your own machine:

```bash
DATABASE_URL="<your neon url>" npx drizzle-kit push
```

Both free tiers are comfortably enough for a few flats.

## The AI bits

Ingredient lookup, nutrition estimates and meal suggestions all go through one small
provider wrapper (`lib/ai/client.ts`).

**Default provider: [OpenRouter](https://openrouter.ai), on its free tier.** Get a key
at [openrouter.ai/keys](https://openrouter.ai/keys) — no card required — and put it in
`OPENROUTER_API_KEY`. Free models are the ones whose id ends in `:free`.

| | |
|---|---|
| Default model | `nvidia/nemotron-3-super-120b-a12b:free` |
| Free limits | 20 requests/minute, 50/day (1000/day once you have ever bought $10 of credit) |
| Cost | ₹0 |

**One setup step that trips everyone up:** free endpoints are only offered to accounts
that allow training on inputs. Turn on *"Enable free endpoints that may train on inputs"*
at [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy), or every
call fails with a confusing 404. The app detects that case and tells you.

Because of that, prompts sent to a free model may be used for training, so **flatmates'
names are stripped before anything leaves the server** — the model sees "Flatmate 1:
veg, goal gain, allergic to peanuts". Nobody's age, height or weight is ever sent; only
diet, goal, allergies, dislikes, dish names and how far off the day's nutrition targets
are. Switch to `AI_PROVIDER="anthropic"` if you would rather nothing be trained on.

50 requests a day is plenty: a request is spent only when you add a *new* dish, refetch
its ingredients, or press "Ask AI". Everyday voting, planning and shopping cost nothing.

Swap models with `OPENROUTER_MODEL` — anything from
[the free list](https://openrouter.ai/models?max_price=0). Worth trying if the default
starts giving poor ingredient lists:

- `dots-studio/dots-3-note-preview:free` — 512k context
- `nvidia/nemotron-3-ultra-550b-a55b:free` — biggest, noticeably slower
- `google/gemma-4-31b-it:free` — fast and small

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
Postgres · OpenRouter. Auth is email + password (bcrypt) with a signed JWT in an
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
