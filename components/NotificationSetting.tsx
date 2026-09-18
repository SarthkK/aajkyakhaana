"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, cx } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { logClient } from "@/lib/log-client";

/** Works out where this browser stands, without touching React state. */
async function currentState(): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // iOS only exposes the Push API to apps added to the home screen.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    return isIOS && !standalone ? "needs-install" : "unsupported";
  }

  if (Notification.permission === "denied") return "blocked";

  const registration = await navigator.serviceWorker.getRegistration();
  const existing = await registration?.pushManager.getSubscription();
  return existing ? "on" : "off";
}

/** base64url → Uint8Array, the format the Push API wants for the VAPID key. */
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "unsupported" | "needs-install" | "off" | "on" | "blocked";

export function NotificationSetting({
  prefs,
  onPrefChange,
}: {
  prefs: { notifyMeals: boolean; notifyComments: boolean; notifyLocks: boolean };
  onPrefChange: (key: "notifyMeals" | "notifyComments" | "notifyLocks", value: boolean) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<State>("off");
  const [busy, setBusy] = useState(false);

  // Reading the browser's permission and subscription is exactly the "sync with an
  // external system" case effects exist for, so the state lands in the promise callback.
  useEffect(() => {
    let cancelled = false;
    void currentState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        toast("Notifications not allowed", { tone: "info" });
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
      setState("on");
      logClient.info("push enabled");
      toast("You'll hear when the plan changes");
    } catch (err) {
      logClient.error("could not enable push", err);
      toast(err instanceof Error ? err.message : "Could not turn those on", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.del(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`);
        await subscription.unsubscribe();
      }
      setState("off");
      toast("Notifications off on this device", { tone: "info" });
    } catch (err) {
      logClient.error("could not disable push", err);
      toast("Could not turn those off", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "size-10 rounded-2xl grid place-items-center shrink-0",
            state === "on" ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted",
          )}
        >
          {state === "on" ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Notifications</p>
          <p className="text-xs text-muted leading-relaxed mt-0.5">
            {state === "on"
              ? "On for this device. Your flatmates' changes will reach you."
              : state === "blocked"
                ? "Blocked in your browser settings — you'll need to allow them there first."
                : state === "needs-install"
                  ? "On iPhone, add Kya Khaana to your home screen first, then come back here."
                  : state === "unsupported"
                    ? "This browser can't do notifications."
                    : "Get told when someone adds a meal or replies, instead of checking."}
          </p>
        </div>
      </div>

      {(state === "off" || state === "on") && (
        <Button
          variant={state === "on" ? "secondary" : "primary"}
          className="w-full"
          onClick={state === "on" ? disable : enable}
          loading={busy}
        >
          {state === "on" ? (
            <>
              <BellOff className="size-4" /> Turn off on this device
            </>
          ) : (
            <>
              <Bell className="size-4" /> Turn on notifications
            </>
          )}
        </Button>
      )}

      {state === "on" && (
        <div className="space-y-1 pt-1">
          {(
            [
              ["notifyMeals", "Meals added or changed"],
              ["notifyComments", "Replies on a meal"],
              ["notifyLocks", "When a meal is settled"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 py-2 cursor-pointer">
              <span className="text-sm">{label}</span>
              <Switch checked={prefs[key]} onChange={(value) => onPrefChange(key, value)} />
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "w-11 h-6 rounded-full p-0.5 transition-colors shrink-0",
        checked ? "bg-accent" : "bg-line",
      )}
    >
      <span
        className={cx(
          "block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
