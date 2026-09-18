"use client";

import { useEffect, useState } from "react";

/**
 * "Aaj kya khaana hai?" over the app for about a second.
 *
 * Two deliberate constraints, because a splash screen that delays the answer works
 * against the whole point of the app:
 *   - the real screen renders underneath the whole time, so nothing is being waited on;
 *   - it shows once per browser session, not on every navigation back to the tab.
 */
const SEEN_KEY = "kk_splash_seen";

export function Splash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Deferred by a frame so the state change happens in a callback rather than
    // synchronously inside the effect. One frame is not perceptible.
    let timer: ReturnType<typeof setTimeout>;

    const frame = requestAnimationFrame(() => {
      let seen = false;
      try {
        seen = sessionStorage.getItem(SEEN_KEY) === "1";
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Private mode or blocked storage: skip it rather than showing it every time.
        seen = true;
      }
      if (seen) return;

      setShow(true);
      timer = setTimeout(() => setShow(false), 1300);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className="splash-layer fixed inset-0 z-[60] grid place-items-center bg-bg pointer-events-none"
    >
      <div className="splash-text text-center px-8">
        <div className="text-5xl mb-4">🍲</div>
        <p className="text-2xl font-bold tracking-tight text-ink">Aaj kya khaana hai?</p>
      </div>
    </div>
  );
}
