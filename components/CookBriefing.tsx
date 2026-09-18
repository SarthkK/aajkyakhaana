"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Send } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/SessionProvider";
import { isSlotLocked, resolveSlot } from "@/lib/slots";
import { SLOTS, type Slot } from "@/lib/dates";
import type { PlanEntryView } from "@/lib/types";

/** What the cook is actually called in Hinglish, rather than an English app label. */
const SLOT_HINGLISH: Record<Slot, string> = {
  breakfast: "Nashta",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Shaam ka snack",
};

/**
 * The last mile of this whole app is a person who does not use it. The cook gets told
 * on WhatsApp or in person, so the plan has to leave the app as plain text they can
 * read — one dish per meal, no votes, no tallies, no app jargon.
 */
export function CookBriefing({ date, entries }: { date: string; entries: PlanEntryView[] }) {
  const { household } = useSession();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const lines: string[] = [];
  for (const slot of SLOTS) {
    const slotEntries = entries.filter((e) => e.slot === slot);
    if (slotEntries.length === 0) continue;

    const { winner } = resolveSlot(slotEntries, { locked: isSlotLocked(date, slot, household) });
    if (!winner) continue;

    const servings = winner.servings ? ` (${winner.servings} log)` : "";
    lines.push(`${SLOT_HINGLISH[slot]}: ${winner.dish.name}${servings}`);
  }

  if (lines.length === 0) return null;

  const message = [`Aaj ka menu 🍲`, ...lines].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("Menu copied — paste it to your cook");
    } catch {
      toast("Could not copy it", { tone: "bad" });
    }
  }

  function sendOnWhatsApp() {
    // wa.me opens the app if installed and the web client otherwise, and lets the
    // person pick the chat — no phone number is stored or needed.
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="size-9 rounded-2xl bg-surface-2 grid place-items-center shrink-0 text-base">🧑‍🍳</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            Tell {household.cookName ?? "the cook"}
          </p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            Today&apos;s menu as plain text, ready to send.
          </p>
        </div>
      </div>

      <pre
        className={cx(
          "text-xs leading-relaxed whitespace-pre-wrap font-sans bg-surface-2 rounded-2xl px-3.5 py-3 mb-3",
          "border border-line text-ink",
        )}
      >
        {message}
      </pre>

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" className="flex-1" onClick={sendOnWhatsApp}>
          <MessageCircle className="size-3.5" /> WhatsApp
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigator.share({ text: message }).catch(() => {})}
            aria-label="Share"
            className="px-3"
          >
            <Send className="size-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
