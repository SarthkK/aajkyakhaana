"use client";

import { useEffect } from "react";

/** Registers the service worker so the app can be installed to a phone's home screen. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not being installable is not worth bothering anyone about.
    });
  }, []);

  return null;
}
