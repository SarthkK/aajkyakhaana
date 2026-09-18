# Tests

No framework, no config — plain scripts you can run one at a time.

| Command | What it covers |
|---|---|
| `npm run test:unit` | Pure logic: shopping-list merging, browser detection, AI error handling |
| `npm run test:e2e` | Every feature, against a running server |
| `npm test` | Both |

## The end-to-end suite

`e2e.mjs` drives the real HTTP API with three independent cookie jars — two flatmates
and an outsider — and checks roughly a hundred things: auth and its rejections, flats
and join codes, the dish library and AI enrichment, planning, voting, contested slots,
comments, the shopping list (including that pantry staples and water never reach it),
the feed and its polling cursor, notifications, repeat-week, and that no flat can see
another's anything.

By default it hits `http://localhost:3000`. To run it against the deployed app:

```bash
BASE=https://aajkyakhaana.vercel.app npm run test:e2e
```

It creates accounts as `e2e-<n>-<timestamp>@test.in`. **Clean them up afterwards** —
against production especially:

```sql
delete from users where email like 'e2e-%@test.in';
delete from households where id not in (select household_id from household_members);
```

## Things worth knowing

- The AI checks call a real model, so they cost quota and can be slow. They are the
  only non-deterministic part of the suite.
- `ai.test.mts` uses no network: it mocks provider responses to check the error
  handling, including shapes free models actually produce when they misbehave.
- The suite is deliberately readable over clever. A failing line should tell you what
  broke without you having to read the test.
