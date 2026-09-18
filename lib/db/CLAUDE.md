# Data layer

## The connection is lazy, deliberately

`db` is a `Proxy` that connects on first property access. It used to connect at module
scope, which broke the build:

```
Failed to collect page data for /api/dishes/[id]/enrich
  [cause]: DATABASE_URL is not set
```

Next evaluates every route module while building, so an eager connection made
`next build` require a database URL to produce output that never touches a database.
A fresh clone could not be built at all. Deferring it also puts the error somewhere
useful — at the query that wanted data, rather than during a build that did not.

Do not "simplify" this back to a top-level `drizzle(...)` call.

## Conventions

**Dates** are `date` columns in `YYYY-MM-DD` form, read as strings, always in the
household's timezone. Never timestamps — "today" has to mean today where the flat is,
not where the server is.

**Message ids are `bigserial`, not uuid.** The id doubles as the chat polling cursor,
and "anything newer than 412?" has to be an index scan for a 3-second poll to be
affordable. Everything else uses uuid.

**Nutrition is `jsonb` per serving on the dish**, and a day's total assumes each person
eats one serving of everything planned. That is deliberately rough — a planning signal,
not a food diary.

**Denormalise feed events.** `messages.meta` carries the dish name and date so an event
still reads correctly after the dish or plan entry is deleted.

## Scoping

Every household-owned table carries `householdId`, and **every read filters by it**.
`createdBy` and `addedBy` are stored for display and never appear in a `WHERE` clause —
dishes, plans, lists and the feed are shared across the flat by design.

The e2e suite has isolation checks for all of these. Keep them passing when adding a
table.

## Migrations

Schema changes go to **production first, then the deploy** — the old code must keep
working after the migration, which is why everything so far has been additive
(new tables, new columns with defaults). Review the SQL before running it:

```bash
DATABASE_URL="<prod>" npx drizzle-kit generate --name what_changed
DATABASE_URL="<prod>" npx drizzle-kit push --force
```

Dev and production are separate Neon **projects**, not branches — see the root
`CLAUDE.md` for why that matters to the free-tier budget.
