/** Checks the browser sniffing against real user-agent strings. */
const UAS: Record<string, string> = {
  "iPhone Safari":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "iPhone Chrome":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  "iPhone Firefox":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15",
  "Android Chrome":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  "macOS Safari":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "macOS Chrome":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Windows Edge":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};

const EXPECT: Record<string, { os: string; browser: string; canInstallHere: boolean; requiresInstallForPush: boolean }> = {
  "iPhone Safari": { os: "ios", browser: "safari", canInstallHere: true, requiresInstallForPush: true },
  "iPhone Chrome": { os: "ios", browser: "chrome", canInstallHere: false, requiresInstallForPush: true },
  "iPhone Firefox": { os: "ios", browser: "firefox", canInstallHere: false, requiresInstallForPush: true },
  "Android Chrome": { os: "android", browser: "chrome", canInstallHere: true, requiresInstallForPush: false },
  "macOS Safari": { os: "macos", browser: "safari", canInstallHere: true, requiresInstallForPush: false },
  "macOS Chrome": { os: "macos", browser: "chrome", canInstallHere: true, requiresInstallForPush: false },
  "Windows Edge": { os: "windows", browser: "edge", canInstallHere: true, requiresInstallForPush: false },
};

let pass = 0, fail = 0;

for (const [name, ua] of Object.entries(UAS)) {
  // Minimal browser stand-ins so the module can run under Node.
  // Node 26 defines navigator as a getter-only global, so it has to be redefined.
  const fakeNavigator = { userAgent: ua, maxTouchPoints: 0, standalone: false };
  Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true });
  Object.defineProperty(globalThis, "window", {
    value: { matchMedia: () => ({ matches: false }), navigator: fakeNavigator },
    configurable: true,
  });

  const { detectPlatform } = await import(`../lib/platform.ts?v=${Math.random()}`);
  const got = detectPlatform();
  const want = EXPECT[name];

  const ok =
    got.os === want.os &&
    got.browser === want.browser &&
    got.canInstallHere === want.canInstallHere &&
    got.requiresInstallForPush === want.requiresInstallForPush;

  if (ok) { pass++; console.log(`  ok   ${name.padEnd(16)} → ${got.os}/${got.browser} install-here=${got.canInstallHere}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
