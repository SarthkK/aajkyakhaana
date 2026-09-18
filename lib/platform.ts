"use client";

/**
 * What we can and cannot know about how someone is running the app.
 *
 * We CAN tell that the app is running from the home screen right now (standalone
 * display mode). We CANNOT tell, from inside a browser tab, whether the person has
 * installed it — iOS gives a home-screen web app its own storage partition, so a flag
 * written by the installed app is invisible to Safari and vice versa, and
 * getInstalledRelatedApps() is Chrome-on-Android only. So the app asks rather than
 * assumes, and never nags someone who has clearly already installed it.
 */

export type Platform = {
  /** Running from the home screen / dock rather than a browser tab. */
  standalone: boolean;
  os: "ios" | "android" | "macos" | "windows" | "other";
  /** On iOS every browser is WebKit underneath, so this is the *shell* the user sees. */
  browser: "safari" | "chrome" | "firefox" | "edge" | "arc" | "other";
  /** True when this browser can install the app itself. On iOS only Safari can. */
  canInstallHere: boolean;
  /** Push needs a home-screen install first — true on iOS, false everywhere else. */
  requiresInstallForPush: boolean;
};

export function detectPlatform(): Platform {
  if (typeof window === "undefined") {
    return { standalone: false, os: "other", browser: "other", canInstallHere: false, requiresInstallForPush: false };
  }

  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    // iOS Safari's own flag, which predates the standard media query.
    (window.navigator as { standalone?: boolean }).standalone === true;

  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

  const os: Platform["os"] = isIOS
    ? "ios"
    : /android/i.test(ua)
      ? "android"
      : /macintosh|mac os x/i.test(ua)
        ? "macos"
        : /windows/i.test(ua)
          ? "windows"
          : "other";

  // Order matters: Chrome's UA contains "Safari", Edge's contains "Chrome", and the
  // iOS variants use their own tokens (CriOS, FxiOS, EdgiOS) because they are all WebKit.
  const browser: Platform["browser"] = /edg(a|ios|e)?\//i.test(ua)
    ? "edge"
    : /crios|chrome/i.test(ua)
      ? "chrome"
      : /fxios|firefox/i.test(ua)
        ? "firefox"
        : /arc\//i.test(ua)
          ? "arc"
          : /safari/i.test(ua)
            ? "safari"
            : "other";

  // On iOS, only Safari can add to the home screen in a way that grants push.
  const canInstallHere = isIOS ? browser === "safari" : true;

  return { standalone, os, browser, canInstallHere, requiresInstallForPush: isIOS };
}

/** Whether this browser could ever show notifications in its current mode. */
export function pushPossible(platform: Platform) {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (platform.requiresInstallForPush && !platform.standalone) return false;
  return true;
}
