"use client";

/**
 * A short buzz on the taps that commit something. Android fires this; iOS Safari
 * ignores it silently, which is fine — it is a bonus, never the only feedback.
 */
export function tap(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw when the page is not visible.
  }
}
