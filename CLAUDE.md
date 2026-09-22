# Kya Khaana — working notes

A mobile-first PWA for shared flats in India that have a cook. Decide what to eat,
vote on it, argue about it, and turn the plan into a grocery list.

Everything below is something that cost real debugging to learn. None of it is
guessable from reading the code.

---

## Before you push

**A push to `main` deploys to production.** The GitHub repo is connected to Vercel, so
every commit that lands on `main` builds and goes live — and a failed build emails the
owner.

```bash
npm run build     # this is what Vercel runs; a passing commit is not a passing build
npm run test:unit # fast, no network
```

A commit succeeding is not a build succeeding. This has already broken once: type
errors in `tests/` were visible in the terminal, the commit went out anyway, and the
resulting failure emailed the owner. Run the build **before** pushing, not after.

`npx vercel --prod --yes` deploys the working tree directly, which is the right way to
verify something without putting it on `main`.

---

## Environments

| | Where | Notes |
|---|---|---|
| Production DB | Neon project `aajkyakhaana-sg`, branch `main` | Real users live here |
| Development DB | Neon project **`kyakhaana-dev`** (separate project, not a branch) | `.env.local` points here |
| Hosting | Vercel project `aajkyakhaana`, functions pinned to `sin1` | |

**Dev is a separate Neon *project* on purpose.** Neon's free tier gives 100 CU-hours
**per project**, and dev used to be a branch of production — so testing spent the
allowance the flat actually runs on. Exceeding it suspends compute until the next
billing period, i.e. the app goes down. Do not move dev back into the production
project.

Schema changes go to **production first, then deploy** — never the other way round.
All changes so far have been additive (new table, new columns with defaults), which is
what makes that order safe. Check the generated SQL before running it on production:

```bash
DATABASE_URL="<prod>" npx drizzle-kit generate --name what_changed   # review the SQL
DATABASE_URL="<prod>" npx drizzle-kit push --force
```

---

## Things that will bite you

**The `db` export is a lazy proxy. Keep it that way.** It connects on first property
access, not on import. Next evaluates every route module during a build, so an eager
connection made `next build` fail on any machine without `DATABASE_URL` — including a
fresh clone. See `lib/db/CLAUDE.md`.

**The signed-in shell is static, and must stay that way.** `app/(app)/layout.tsx`
reads no cookies and touches no database. That is not tidiness — any `cookies()` call
there makes every page beneath it dynamic, which turned each tab switch into a ~600ms
server round trip that prefetching cannot avoid, because dynamic routes are not
cached. Auth is gated in `middleware.ts` (signature only, at the edge) and the session
arrives from `/api/auth/me`, which the client caches. Measured: 646ms → 166ms to fully
visible, with one 62ms request. If you find yourself adding `await cookies()` to that
layout, you are undoing this.

**Dates are `YYYY-MM-DD` strings in the flat's timezone, never timestamps.** "Today"
means today where the flat is. `lib/dates.ts` owns this; don't reach for `Date` maths.

**Everything is scoped to a household.** Every read filters by `householdId` and
nothing filters by `createdBy` — that column is stored for display only. Dishes, plans,
the shopping list and the feed are all shared by design. If something looks unshared,
the two people are in different flats.

**A session can outlive its account.** Entry pages resolve the real user rather than
trusting the cookie, and a 401 from any API call triggers a full page load to sign-in.
Don't "optimise" that to a soft navigation — the hard load is what discards cached SWR
data belonging to the dead session.

**Nobody's name reaches a model provider.** Free-tier prompts may be trained on, so
every prompt pseudonymises people through `lib/privacy.ts` — "Person A", "Person B" —
and swaps the real names back into whatever the model writes. Ages, heights, weights
and emails are never sent at all. Diets, goals, allergies and dislikes are, because a
plan that ignores an allergy is worse than useless. If you add a prompt, pseudonymise
it; the three existing ones all do.

**`drizzle-kit generate` lies here; use `push`.** `generate` diffs against the
migration journal, and this project has only ever used `push` — so `generate` will
confidently offer to create tables that production already has. `push` diffs the live
database, which is the thing you actually care about.

**A slot has one meal, however many dishes are proposed for it.** Nothing ever sets a
plan entry to `cancelled` on its own — losing a vote does not — so "every entry that is
not cancelled" silently means "every dish anyone ever suggested". Both the day summary
and the shopping list were written that way, so a flat that argues about dinner was told
it was eating 2500 kcal and hitting 100% of protein off a day with one real meal in it,
and the grocery list bought ingredients for the dishes that lost. Worse, the same numbers
feed the chef, the planner and the suggestion prompt, so the model was being told the
flat was well fed. Anything totalling a day must pick the winner per slot with
`resolveSlot` (most votes, then first proposed) — the rule the board and the cook's
briefing already display. `tests/slots.mjs` guards it. Note that proposing a dish
upvotes it for the proposer, so one person cannot break their own tie.

**Nulls from the AI must be dropped, not stored.** Strict JSON mode makes the model
emit every nutrient, using `null` where it cannot estimate. Storing those as `0` drags
the day's totals down and silently invents shortfalls. The same applies to blanks: the
chef returns `dish_ideas: [""]` when it has no ideas, because strict mode requires the
key — stored as-is, that rendered a nameless one-tap chip that added a nameless dish.

**`void somePromise()` does not survive the response. Use `runAfterResponse`.** Vercel
can suspend the instance the moment a handler returns, and an outbound request that has
not finished stops mid-flight — it resumes only when that instance is next woken by
another request. Realtime nudges and push notifications were both plain `void` calls, so
they arrived one action late or not at all. `tests/realtime-live.mjs` showed it exactly:
every nudge landed inside the *next* test's window, and the tell was that the "thinking"
nudge — published *before* the slow model call, while the handler was still running —
always arrived, while the reply nudge published just before the response did not.
Delivery went from a 6s timeout to ~200ms. `lib/background.ts` wraps `waitUntil`; it
keeps fire-and-forget semantics, so callers still never wait and never fail.

---

## Realtime, and the polling underneath it

The chat is live when `ABLY_API_KEY` is set and polls when it is not. Both paths are
real and both are tested — do not remove the fallback.

**The socket carries a nudge, not content.** The message is "household X moved to
cursor N" and nothing else; the client then fetches from our own API. Three reasons,
in order of importance:

1. Nothing anyone writes — chat, AI replies, names — passes through a third party,
   which would otherwise undo the pseudonymisation in `lib/privacy.ts`.
2. It replaces only the *timer*, so every fetch path is the one polling already used.
   That is why the fallback is free rather than a second implementation.
3. A few bytes per event means the 6M/month free allowance is unreachable.

A nudge for a new message carries its cursor, so only the new part is fetched. A vote
or a settled poll changes a row already on screen **without moving the cursor**, so it
carries none and triggers a full refresh. Getting that wrong means tallies silently
never update.

Tokens are minted server-side, scoped to one channel, and grant subscribe only — a
browser cannot publish, so nobody can forge a nudge or listen to another flat.

**A nudge that lands mid-fetch must be remembered, not dropped.** `pull()` used to bail
out whenever a fetch was already in flight, which is the *common* case here: asking a
question fires three signals inside a second — the message, "thinking", then the reply —
so the reply's nudge nearly always arrives while the message's fetch is still out. The
dots then span over a stale feed until the 30s heartbeat. It now sets a pending flag and
loops once more when the fetch returns.

**Only an `assistant` message clears the thinking indicator.** Clearing it on any
incoming message raced with the question that triggered the assistant in the first
place, wiping the dots instantly for everyone but the asker.

### Why polling looks the way it does

Three rules in `lib/useChatFeed.ts`, all about keeping a free-tier database cheap:

1. Poll `/api/chat/cursor`, which returns one number from an index — not the feed.
   Message ids are `bigserial` precisely so this is an index scan.
2. Stop while the tab is hidden.
3. Stop after five idle minutes.

Rule 3 is the one that matters. **Neon bills for the database being awake, not for
queries**, and it only sleeps after 5 minutes of no activity. A tab left open overnight
would hold it awake till morning — that, not the interval, is what would exhaust the
budget. 3s and 10s cost effectively the same.

A slow 30s heartbeat runs even on realtime, so a dropped nudge costs seconds rather
than leaving the chat silently stale.

**Sockets terminating at our own app do not work**, which is why this uses a service:
Vercel Hobby caps any connection at 300s, and serverless invocations cannot push to
each other, so there is no way for one instance to notify a stream held by another.

## Layout and structure

```
middleware.ts     the auth gate, so pages beneath it can stay static
app/(app)/        the signed-in, tab-bar part: today, plan, chat, dishes, shopping, me
app/api/          REST endpoints; handlers stay thin
lib/ai/prompts/   every word sent to a model — nothing else holds prompt text
lib/services/     work that is not HTTP (notifications, chat)
lib/db/           schema and the lazy connection
tests/            plain scripts, no framework
```

Nav is **Today · Plan · Chat · List · Me**. Dishes is deliberately not a tab — it is
reached from the header on Today and Plan. Five tabs is the comfortable maximum on a
phone, and the dish library is somewhere you go occasionally to tidy up.

---

## Testing

```bash
npm run test:unit      # pure logic, no network
npm run test:e2e       # every feature, against a running server
npm run test:chat      # the chat assistant and the in-chat vote (calls a real model)
npm run test:pantry    # ingredient reconciliation, pantry, multi-day planner
npm run test:slots     # one meal per slot, and editing the list and the pantry
npm run test:realtime  # token scoping, and that everything works without a key
BASE=https://aajkyakhaana.vercel.app npm run test:e2e
```

Every suite signs up throwaway accounts, and they all end in `@test.in` — but each uses
its own prefix (`e2e-`, `c1-`/`c2-`/`c3-`, `lr1-`/`lr2-`/`lr3-`, `p-`, `rt-`). Deleting
only `e2e-%` leaves the rest behind, which is how a database fills up with flats nobody
lives in. **Always clean up afterwards**, especially against production. Look first —
real people are in here:

```sql
select email from users where email like '%@test.in';   -- check before deleting
delete from users where email like '%@test.in';
delete from households where id not in (select household_id from household_members);
```

Production's `DATABASE_URL` is a Vercel **Secret**, so it cannot be read back with
`vercel env pull` — that returns `[SENSITIVE]`. Cleaning production needs the connection
string from Neon directly.

**Run the AI checks twice.** They are the only non-deterministic part, and running
twice is what caught the fallback models being completely broken — the first run
passed because the primary model happened to answer.

There are real users in production (`Shandaar Grehesti`, three members). Never delete
data without checking whose it is first.

---

## Verifying by eye

Browser automation works, with two prerequisites that waste a lot of time otherwise:

- **Chrome must be launched explicitly** — `open -a "/Applications/Google Chrome.app"`.
  The default browser on this machine is Arc, so plain `open` opens the wrong one.
- **Chrome must be foregrounded** — `osascript -e 'tell application "Google Chrome" to
  activate'`. Backgrounded, `document.hidden` is true, so polling correctly stops and
  keystrokes do not land. That is the app behaving properly, not a bug.

Prefer `find` to get element refs over guessing coordinates; the window gets resized by
the tooling and stale coordinates silently click the wrong thing.
