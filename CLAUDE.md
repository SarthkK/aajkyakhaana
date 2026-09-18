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

**Nulls from the AI must be dropped, not stored.** Strict JSON mode makes the model
emit every nutrient, using `null` where it cannot estimate. Storing those as `0` drags
the day's totals down and silently invents shortfalls.

---

## Free-tier budgets, and why polling looks the way it does

The chat polls every 3 seconds, and that is cheap **only** because of three rules in
`lib/useChatFeed.ts`:

1. It polls `/api/chat/cursor`, which returns one number from an index — not the feed.
   Content is fetched only when that number moves. Message ids are `bigserial`
   precisely so this is an index scan.
2. It stops while the tab is hidden.
3. It stops after five idle minutes.

Rule 3 is the one that matters. **Neon bills for the database being awake, not for
queries**, and it only sleeps after 5 minutes of no activity. A tab left open
overnight would hold it awake till morning — that, not the poll interval, is what
would exhaust the budget. 3s and 10s cost effectively the same.

WebSockets were considered and rejected: Vercel Hobby caps any connection at 300s, so
a socket means reconnect handling every five minutes, and an idle connection guarantees
the database never sleeps. Push notifications already cover the case that matters —
someone who is *not* looking at the app.

---

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
npm test                                            # unit + e2e against localhost
BASE=https://aajkyakhaana.vercel.app npm run test:e2e
```

The e2e suite creates accounts as `e2e-<n>-<timestamp>@test.in`. **Always clean up
afterwards**, especially against production:

```sql
delete from users where email like 'e2e-%@test.in';
delete from households where id not in (select household_id from household_members);
```

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
