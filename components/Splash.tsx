/**
 * "Aaj kya khaana hai?" over the app for about a second, once per browser session.
 *
 * A launch screen, in the native sense: it plays when the app cold-starts and never on
 * navigation, because the layout it lives in persists across route changes.
 *
 * Earlier attempts tied it to a session flag, which went wrong twice — from React
 * state it rendered *after* first paint, so you saw skeletons and then the splash; from
 * an inline script it beat the paint but put a raw <script> in the React tree, which
 * React never executes on the client and warns about. Reading a cookie fixed both but
 * forced the whole signed-in app to render dynamically, which cost ~600ms on every tab
 * switch. Being a plain part of the static shell has none of those problems.
 */
export function Splash() {
  return (
    <div aria-hidden className="splash-layer fixed inset-0 z-[60] grid place-items-center bg-bg pointer-events-none">
      <div className="splash-text text-center px-8">
        <div className="text-5xl mb-4">🍲</div>
        <p className="text-2xl font-bold tracking-tight text-ink">Aaj kya khaana hai?</p>
      </div>
    </div>
  );
}
