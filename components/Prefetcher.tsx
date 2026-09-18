"use client";

import { useEffect } from "react";
import { prefetch } from "@/lib/client";

/**
 * Warms the cache for the other tabs shortly after the first screen paints, so
 * switching tabs shows real content instead of a skeleton. Deliberately idle-time
 * and one-shot: this is a phone app, possibly on a patchy connection.
 */
const WARM = ["/api/plan", "/api/chat", "/api/shopping", "/api/profile"];

export function Prefetcher() {
  useEffect(() => {
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (fn: () => void) => window.setTimeout(fn, 600);

    const handle = idle(() => {
      for (const path of WARM) void prefetch(path).catch(() => {});
    });

    return () => {
      if (typeof window.cancelIdleCallback === "function" && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      }
    };
  }, []);

  return null;
}
