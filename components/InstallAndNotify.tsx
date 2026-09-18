"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Download, X } from "lucide-react";
import { api } from "@/lib/client";
import { Sheet, Button, cx } from "@/components/ui";
import { InstallGuide } from "@/components/InstallGuide";
import { useToast } from "@/components/Toast";
import { detectPlatform, pushPossible, type Platform } from "@/lib/platform";
import { logClient } from "@/lib/log-client";

/** Chrome fires this so a site can offer installation at a sensible moment. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const INSTALL_SNOOZE_KEY = "kk_install_snoozed_until";
const NOTIFY_ASKED_KEY = "kk_notify_asked";
const SNOOZE_DAYS = 5;

function snoozed() {
  try {
    const until = Number(localStorage.getItem(INSTALL_SNOOZE_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
  } catch {
    // Not remembering is only a minor annoyance; never block on it.
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Two nudges, each at the only moment it makes sense:
 *
 *  - In a browser tab: offer to add the app to the home screen. Dismissible, and
 *    silent for five days afterwards.
 *  - Running from the home screen, having never been asked: offer notifications.
 *    This is the moment it becomes possible on iPhone, and asking cold in a Safari
 *    tab would have failed there anyway.
 */
export function InstallAndNotify() {
  const toast = useToast();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [askNotify, setAskNotify] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    // One frame's delay keeps this out of the first paint, and off the splash.
    const frame = requestAnimationFrame(() => {
      const detected = detectPlatform();
      setPlatform(detected);

      if (!detected.standalone) {
        if (!snoozed()) setShowBanner(true);
        return;
      }

      // Installed and opened from the home screen. If we have never asked about
      // notifications, now is the moment — on iPhone this is the first time it can work.
      let asked = false;
      try {
        asked = localStorage.getItem(NOTIFY_ASKED_KEY) === "1";
      } catch {
        asked = false;
      }

      if (!asked && pushPossible(detected) && Notification.permission === "default") {
        setAskNotify(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const rememberAsked = useCallback(() => {
    try {
      localStorage.setItem(NOTIFY_ASKED_KEY, "1");
    } catch {
      // Worst case they get asked again next launch.
    }
  }, []);

  async function enableNotifications() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      rememberAsked();

      if (permission !== "granted") {
        setAskNotify(false);
        toast("No problem — you can turn them on later from the Me tab", { tone: "info" });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Push is not configured on the server");

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      await api.post("/api/push/subscribe", subscription.toJSON());
      logClient.info("push enabled from install nudge");
      setAskNotify(false);
      toast("Done — you'll hear when the plan changes");
    } catch (err) {
      logClient.error("could not enable push from nudge", err);
      toast(err instanceof Error ? err.message : "Could not turn those on", { tone: "bad" });
      setAskNotify(false);
    } finally {
      setBusy(false);
    }
  }

  async function nativeInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    logClient.info("native install prompt", choice.outcome);
    if (choice.outcome === "accepted") setShowBanner(false);
    setInstallEvent(null);
  }

  if (!platform) return null;

  return (
    <>
      {showBanner && !platform.standalone && (
        <div
          className="fixed inset-x-0 z-40 px-4 animate-in"
          style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-md mx-auto flex items-center gap-3 rounded-2xl bg-surface border border-line shadow-lg px-4 py-3">
            <span className="size-9 rounded-xl bg-accent-soft text-accent-text grid place-items-center shrink-0">
              <Download className="size-4" />
            </span>
            <button onClick={() => setShowGuide(true)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium leading-tight">Put this on your home screen</p>
              <p className="text-xs text-muted mt-0.5 leading-snug">
                {platform.requiresInstallForPush
                  ? "Opens like an app, and it's the only way to get notifications on iPhone."
                  : "Opens like an app, and can notify you when the plan changes."}
              </p>
            </button>
            <button
              onClick={() => {
                setShowBanner(false);
                snooze();
              }}
              className="p-1.5 -mr-1 text-muted shrink-0"
              aria-label="Not now"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <InstallGuide
        open={showGuide}
        onClose={() => {
          setShowGuide(false);
          setShowBanner(false);
          snooze();
        }}
        platform={platform}
        onNativeInstall={installEvent ? nativeInstall : undefined}
      />

      <Sheet
        open={askNotify}
        onClose={() => {
          setAskNotify(false);
          rememberAsked();
        }}
        title="Turn on notifications?"
      >
        <div className="text-center pb-1">
          <div className="size-14 rounded-2xl bg-accent-soft text-accent-text grid place-items-center mx-auto mb-4">
            <Bell className="size-7" />
          </div>
          <p className="text-sm text-muted leading-relaxed mb-5 max-w-xs mx-auto">
            Now that Kya Khaana is on your home screen, it can tell you when a flatmate
            adds a meal or replies — instead of you having to check.
          </p>
        </div>

        <Button size="lg" className="w-full" onClick={enableNotifications} loading={busy}>
          <Bell className="size-4" /> Yes, keep me posted
        </Button>
        <button
          onClick={() => {
            setAskNotify(false);
            rememberAsked();
          }}
          className={cx("w-full text-center text-sm text-muted py-3")}
        >
          Not now
        </button>
      </Sheet>
    </>
  );
}
