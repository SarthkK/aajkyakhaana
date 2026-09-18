"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Send, CalendarPlus, CalendarMinus, ChefHat, PauseCircle } from "lucide-react";
import { api } from "@/lib/client";
import { useChatFeed } from "@/lib/useChatFeed";
import { AppHeader } from "@/components/AppHeader";
import { Input, Button, ErrorNote, Avatar, EmptyState, cx } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import type { FeedMessage } from "@/lib/types";

const EVENT_ICONS = {
  meal_added: CalendarPlus,
  meal_removed: CalendarMinus,
  meal_settled: ChefHat,
} as const;

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function ChatPage() {
  const { user, household } = useSession();
  const toast = useToast();
  const { messages, loading, error, live, append } = useChatFeed();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, the way every chat does.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: messages.length > 20 ? "auto" : "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setDraft("");
    try {
      const res = await api.post<{ message: FeedMessage }>("/api/chat", { body });
      append(res.message);
    } catch (err) {
      setDraft(body); // don't lose what they typed
      toast(err instanceof Error ? err.message : "Could not send that", { tone: "bad" });
    } finally {
      setSending(false);
    }
  }

  // Each row decides on its own whether it starts a new day, by looking at the one
  // before it — no running variable to carry across renders.
  const rows = useMemo(
    () =>
      messages.map((message, i) => {
        const day = dayOf(message.createdAt);
        return {
          message,
          day,
          showDay: i === 0 || dayOf(messages[i - 1].createdAt) !== day,
        };
      }),
    [messages],
  );

  return (
    <>
      <AppHeader
        title={household.name}
        subtitle={live ? "Everyone in the flat sees this" : "Paused — tap to catch up"}
        action={
          !live ? (
            <span className="text-muted p-2" title="Polling paused while you were away">
              <PauseCircle className="size-5" />
            </span>
          ) : undefined
        }
      />

      <div
        className="flex flex-col"
        style={{ minHeight: "calc(100dvh - 8.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))" }}
      >
        <div className="flex-1 px-4 pt-4 pb-2">
        {loading && (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cx("flex gap-2.5", i % 2 === 1 && "flex-row-reverse")}>
                <Skeleton className="size-8 rounded-full shrink-0" />
                <Skeleton className={cx("h-12 rounded-2xl", i % 2 ? "w-40" : "w-52")} />
              </div>
            ))}
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        {!loading && messages.length === 0 && (
          <EmptyState
            emoji="💬"
            title="Nothing said yet"
            body="Anything anyone plans shows up here too, so the argument and the decision stay in one place."
          />
        )}

        <div className="space-y-2.5">
          {rows.map(({ message: m, day, showDay }) => {
            const mine = m.userId === user.id;
            const Icon = m.kind !== "text" ? EVENT_ICONS[m.kind] : null;

            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex items-center gap-3 py-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[11px] text-muted font-medium">{day}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}

                {Icon ? (
                  // Plan activity: a quiet line, tappable through to the day it changed.
                  <Link
                    href={m.meta?.date ? `/day/${m.meta.date}` : "/today"}
                    className="flex items-center gap-2 justify-center text-center px-3 py-1.5 mx-auto max-w-[85%] rounded-xl active:bg-surface-2"
                  >
                    <Icon className="size-3.5 text-muted shrink-0" />
                    <span className="text-xs text-muted leading-snug">
                      <span className="font-medium text-ink">{mine ? "You" : (m.authorName ?? "Someone")}</span>{" "}
                      {m.body}
                    </span>
                  </Link>
                ) : (
                  <div className={cx("flex gap-2.5 animate-in", mine && "flex-row-reverse")}>
                    {!mine && <Avatar emoji={m.authorEmoji} name={m.authorName} />}
                    <div className={cx("max-w-[78%] min-w-0", mine && "items-end")}>
                      {!mine && (
                        <p className="text-[11px] text-muted mb-0.5 ml-1">{m.authorName ?? "Someone"}</p>
                      )}
                      <div
                        className={cx(
                          "rounded-2xl px-3.5 py-2.5 break-words",
                          mine
                            ? "bg-accent text-white rounded-br-md"
                            : "bg-surface border border-line rounded-bl-md",
                        )}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      </div>
                      <p className={cx("text-[10px] text-muted mt-0.5", mine ? "text-right mr-1" : "ml-1")}>
                        {timeOf(m.createdAt)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

          <div ref={bottom} />
        </div>

        {/* Sits just above the fixed bottom nav rather than under it, and stays there
            whether the conversation is three messages or three hundred. */}
        <form
          onSubmit={send}
          className="sticky z-30 bg-bg/95 backdrop-blur border-t border-line px-4 py-3 flex gap-2"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${household.name}…`}
            maxLength={1000}
            enterKeyHint="send"
          />
          <Button type="submit" disabled={!draft.trim()} loading={sending} className="px-4 shrink-0">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
