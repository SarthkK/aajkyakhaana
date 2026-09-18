"use client";

import { useState } from "react";
import { Copy, Check, Share, Plus, MoreVertical, Compass } from "lucide-react";
import { Sheet, Button, cx } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { Platform } from "@/lib/platform";

type Step = { icon: React.ReactNode; text: React.ReactNode };

/**
 * Step-by-step instructions for whichever browser the person is actually in. There is
 * no API that installs the app for them on iOS, so the words have to be exactly right
 * — a wrong menu name here and they give up.
 */
function stepsFor(platform: Platform): { title: string; note?: string; steps: Step[] } {
  const share = <Share className="size-4" />;
  const plus = <Plus className="size-4" />;
  const dots = <MoreVertical className="size-4" />;

  if (platform.os === "ios") {
    if (platform.browser !== "safari") {
      return {
        title: "Open this in Safari first",
        note: "On iPhone, only Safari can add an app to your home screen in a way that lets it send notifications. Every other iPhone browser is Safari underneath, but without this bit.",
        steps: [
          { icon: <Copy className="size-4" />, text: <>Copy the link below.</> },
          { icon: <Compass className="size-4" />, text: <>Open <strong>Safari</strong> and paste it in.</> },
          { icon: share, text: <>Tap the <strong>Share</strong> button at the bottom.</> },
          { icon: plus, text: <>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</> },
        ],
      };
    }
    return {
      title: "Add Kya Khaana to your home screen",
      note: "It then opens like a normal app, full screen, and can tell you when a flatmate changes the plan.",
      steps: [
        { icon: share, text: <>Tap the <strong>Share</strong> button at the bottom of Safari — the square with an arrow.</> },
        { icon: plus, text: <>Scroll down the list and tap <strong>Add to Home Screen</strong>.</> },
        { icon: <Check className="size-4" />, text: <>Tap <strong>Add</strong>. Then open it from your home screen.</> },
      ],
    };
  }

  if (platform.os === "android") {
    return {
      title: "Add Kya Khaana to your home screen",
      note: "It then opens like a normal app and can notify you when the plan changes.",
      steps: [
        { icon: dots, text: <>Tap the <strong>⋮</strong> menu, top right.</> },
        { icon: plus, text: <>Tap <strong>Add to Home screen</strong> (sometimes <strong>Install app</strong>).</> },
        { icon: <Check className="size-4" />, text: <>Confirm, then open it from your home screen.</> },
      ],
    };
  }

  if (platform.os === "macos" && platform.browser === "safari") {
    return {
      title: "Add Kya Khaana to your Dock",
      steps: [
        { icon: share, text: <>Click <strong>Share</strong> in the toolbar.</> },
        { icon: plus, text: <>Choose <strong>Add to Dock</strong>.</> },
      ],
    };
  }

  return {
    title: "Install Kya Khaana",
    steps: [
      { icon: plus, text: <>Click the <strong>install</strong> icon at the right of the address bar.</> },
      { icon: dots, text: <>Or open the <strong>⋮</strong> menu and look for <strong>Install</strong> / <strong>Cast, save and share</strong>.</> },
    ],
  };
}

export function InstallGuide({
  open,
  onClose,
  platform,
  /** Android/desktop Chrome can install itself; this fires the browser's own prompt. */
  onNativeInstall,
}: {
  open: boolean;
  onClose: () => void;
  platform: Platform;
  onNativeInstall?: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const { title, note, steps } = stepsFor(platform);
  const needsSafari = platform.os === "ios" && platform.browser !== "safari";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast("Link copied — now paste it into Safari");
    } catch {
      toast("Could not copy — the address is aajkyakhaana.vercel.app", { tone: "info" });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {note && <p className="text-sm text-muted leading-relaxed mb-4">{note}</p>}

      <ol className="space-y-3 mb-5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="size-8 rounded-xl bg-surface-2 border border-line grid place-items-center shrink-0 text-muted">
              {step.icon}
            </span>
            <span className="text-sm leading-relaxed pt-1.5">
              <span className="text-muted font-semibold mr-1.5">{i + 1}.</span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>

      {needsSafari && (
        <Button variant="secondary" className="w-full mb-2" onClick={copyLink}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy the link"}
        </Button>
      )}

      {onNativeInstall && (
        <Button
          className="w-full mb-2"
          onClick={() => {
            onNativeInstall();
            onClose();
          }}
        >
          <Plus className="size-4" /> Install it now
        </Button>
      )}

      <button onClick={onClose} className={cx("w-full text-center text-sm text-muted py-2.5")}>
        Maybe later
      </button>
    </Sheet>
  );
}
