# UI conventions

Mobile-first throughout. Assume a phone in one hand, on Indian mobile data, with a
flatmate waiting for an answer.

---

## The lint rules that actually bite

This project's React rules are stricter than most and will reject patterns that look
fine. These are not style preferences — each one below was hit and worked around
properly rather than disabled.

**`setState` synchronously inside an effect.** Put the state change in a callback that
runs after something — a promise `.then`, a `requestAnimationFrame`, a guard closure.
`useApi` in `lib/client.ts` shows the pattern: a `settle()` helper that only fires after
an `await`.

**Mutating a variable during render.** A running `let` in a `.map` to track "did the day
change" is rejected. Have each row look at its predecessor instead — see the day
separators in `app/(app)/chat/page.tsx`.

**Impure calls during render.** `useRef(Date.now())` is rejected. Initialise to `0` and
set it in the effect.

**`window.location` for internal navigation.** Warned by default, and correct exactly
once: the 401 handler in `lib/client.ts`, where a hard load is wanted so cached SWR data
from the dead session is discarded. It carries a disable comment explaining that.

## Data

`useApi` wraps SWR and keeps one interface: `{ data, error, loading, reload, setData }`.

- Cached per URL, so returning to a tab renders instantly and revalidates behind.
- `keepPreviousData` holds the old screen while a new URL loads — that is what stops
  the layout jumping between days.
- To force a refetch when the path has not changed, give the component a new `key` so
  it remounts. There is no `refreshKey` prop; that was removed for a reason.

## Skeletons, not spinners

Every skeleton mirrors its component's real geometry — same paddings, row heights, row
counts. That precision is the entire point: it is what stops the screen moving when
data lands. A spinner that gets replaced by content is a layout shift.

## The splash is part of the static shell

`Splash.tsx` is a plain server component in the signed-in layout, so it is in the
initial HTML and covers the screen from the first frame while the real page loads
underneath. It plays on cold start and never on navigation, because the layout it
lives in persists across route changes — launch-screen semantics, like a native app.

Three earlier versions got this wrong, each instructively:

- **React state** — rendered *after* first paint, so you saw skeletons and then the
  splash, backwards.
- **An inline `<script>`** — beat the paint, but a raw script in the React tree is
  never executed on client navigation and React 19 errors about it. `next/script` with
  `beforeInteractive` does not help; it still renders a script element.
- **A cookie read in the layout** — correct behaviour, but it made the whole signed-in
  app render dynamically and cost ~600ms on every tab switch.

Do not reintroduce "show it only once per session". It is not worth making the shell
dynamic for.

## Server components cannot import from `components/ui.tsx`

That module is `"use client"`, so anything it exports is a client function. The
`loading.tsx` boundaries are server components rendering skeletons, and importing `cx`
from there made every one of them crash at runtime — *while still building cleanly* —
with "Attempted to call cx() from the server".

`cx` therefore lives in `lib/cx.ts` and is re-exported from `ui.tsx` for convenience.
Any other shared helper a server component needs belongs in `lib/`, not in a
`"use client"` module.

## Fixed elements need matching space

Anything `position: fixed` at the bottom — the nav, the install banner — needs the page
to reserve room, or it covers the last rows. `body` already reserves the nav's height;
the install banner renders its own spacer while visible.

A `sticky` footer only sticks once there is something to scroll. The chat composer sat
halfway up the screen with three messages until the page became a column that fills the
viewport.

## Platform detection

`lib/platform.ts` is the single source of truth, covered by tests over real user-agent
strings — Chrome's UA contains "Safari", Edge's contains "Chrome", and the iOS variants
use `CriOS`/`FxiOS`/`EdgiOS`.

**The iPhone rule that shapes several screens:** iOS only exposes the Push API to apps
installed on the home screen, and only Safari can put one there. So notifications are
offered on first launch *from the home screen*, not in a browser tab where the answer
could only ever be no. Do not move that prompt earlier.

## Feedback

Toasts confirm actions, with undo on the two destructive ones — taking a meal off the
plan, removing a shopping item. Voting is optimistic and reverts on failure. Haptics
(`lib/haptics.ts`) fire on votes and tab changes; Android honours them, iOS ignores
them silently, so they are never the only feedback.

Keep the voice warm and Indian — "Chole Bhature is on for lunch", "Took Rajma Chawal off
dinner", "Nothing decided yet — tap to add". The app is for flatmates, not an admin
console.
