"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Send, CalendarPlus, CalendarMinus, ChefHat, PauseCircle, Sparkles, Dices, Plus, CalendarRange } from "lucide-react";
import { api } from "@/lib/client";
import { useChatFeed } from "@/lib/useChatFeed";
import { AppHeader } from "@/components/AppHeader";
import { Input, Button, ErrorNote, Avatar, EmptyState, cx } from "@/components/ui";
import { ChatPoll } from "@/components/ChatPoll";
import { Skeleton } from "@/components/Skeleton";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import type { FeedMessage } from "@/lib/types";

const EVENT_ICONS: Partial<Record<FeedMessage["kind"], typeof CalendarPlus>> = {
  meal_added: CalendarPlus,
  meal_removed: CalendarMinus,
  meal_settled: ChefHat,
};

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function ChatPage() {
  const { user, household } = useSession();
  const toast = useToast();
  const { messages, loading, error, live, realtime, assistantThinking, append, reload } = useChatFeed();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, the way every chat does.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: messages.length > 20 ? "auto" : "smooth" });
  }, [messages.length, assistantThinking]);

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

  /**
   * Posts the question first, then fetches the answer — so everyone sees what was
   * asked straight away and the reply lands a moment later, the way a person typing
   * would. A slow or failed model never costs anyone their message.
   */
  async function ask() {
    const question = draft.trim();
    if (thinking) return;

    setThinking(true);
    setDraft("");
    try {
      if (question) {
        const posted = await api.post<{ message: FeedMessage }>("/api/chat", { body: question });
        append(posted.message);
      }
      const res = await api.post<{ message: FeedMessage }>("/api/chat/ask");
      append(res.message);
    } catch (err) {
      if (question) setDraft(question);
      toast(err instanceof Error ? err.message : "Couldn't reach the kitchen AI", { tone: "bad" });
    } finally {
      setThinking(false);
    }
  }

  async function startVote() {
    setStarting(true);
    try {
      await api.post("/api/chat/poll", { slot: "dinner" });
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start a vote", { tone: "bad" });
    } finally {
      setStarting(false);
    }
  }

  /**
   * Plans the next few days in one go. Anything the flat has already decided is left
   * alone — a planner that overwrites this morning's agreed dinner is worse than none.
   */
  async function planWeek() {
    setPlanning(true);
    const request = draft.trim();
    try {
      if (request) setDraft("");
      const res = await api.post<{ added: unknown[]; message: FeedMessage }>("/api/chat/plan", {
        days: 3,
        request: request || null,
      });
      append(res.message);
      toast(`Planned ${res.added.length} meals`);
    } catch (err) {
      if (request) setDraft(request);
      toast(err instanceof Error ? err.message : "Could not plan that", { tone: "bad" });
    } finally {
      setPlanning(false);
    }
  }

  /** Adds something the assistant recommended straight onto tonight's plan. */
  async function addIdea(name: string) {
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: household.timezone }).format(new Date());
      const res = await api.post<{ createdDish: { id: string } | null }>("/api/plan", {
        date: today,
        slot: "dinner",
        dishName: name,
      });
      toast(`${name} added to tonight's dinner`);
      if (res.createdDish) void api.post(`/api/dishes/${res.createdDish.id}/enrich`).catch(() => {});
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that", { tone: "bad" });
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
        subtitle={
          !live
            ? "Paused — tap to catch up"
            : realtime
              ? "Live · everyone in the flat sees this"
              : "Everyone in the flat sees this"
        }
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
            body="Anything anyone plans shows up here too. Ask the kitchen AI, or start a vote and let the flat decide."
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

                {m.kind === "poll" ? (
                  <ChatPoll message={m} onChanged={reload} />
                ) : m.kind === "assistant" ? (
                  <div className="flex gap-2.5 animate-in">
                    <span className="size-8 rounded-full bg-accent-soft border border-accent/30 grid place-items-center shrink-0 text-accent-text">
                      <Sparkles className="size-4" />
                    </span>
                    <div className="max-w-[82%] min-w-0">
                      <p className="text-[11px] text-muted mb-0.5 ml-1">Kitchen AI</p>
                      <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 bg-surface border border-accent/25">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                        {m.meta?.dishIdeas?.length ? (
                          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-line">
                            {m.meta.dishIdeas.map((idea) => (
                              <button
                                key={idea}
                                onClick={() => addIdea(idea)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-accent-soft border border-accent/30 text-accent-text pressable"
                              >
                                <Plus className="size-3" /> {idea}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-muted mt-0.5 ml-1">{timeOf(m.createdAt)}</p>
                    </div>
                  </div>
                ) : Icon ? (
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

            {assistantThinking && (
            <div className="flex gap-2.5 animate-in">
              <span className="size-8 rounded-full bg-accent-soft border border-accent/30 grid place-items-center shrink-0 text-accent-text">
                <Sparkles className="size-4" />
              </span>
              <div className="rounded-2xl rounded-bl-md px-3.5 py-3 bg-surface border border-accent/25 inline-flex items-center gap-1.5">
                <span className="sr-only">Kitchen AI is thinking</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="size-1.5 rounded-full bg-accent-text/70 animate-bounce"
                    style={{ animationDelay: `${i * 140}ms`, animationDuration: "900ms" }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottom} />
        </div>

        {/* Sits just above the fixed bottom nav rather than under it, and stays there
            whether the conversation is three messages or three hundred. */}
        <div
          className="sticky z-30 bg-bg/95 backdrop-blur border-t border-line"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {/* The two things worth doing here that a plain chat cannot: ask the app what
              to cook, or make everyone decide together. */}
          <div className="flex gap-1.5 px-4 pt-2.5 overflow-x-auto no-scrollbar">
            <Button size="sm" variant="secondary" className="shrink-0" onClick={ask} loading={thinking}>
              <Sparkles className="size-3.5 text-accent" />
              {draft.trim() ? "Ask this" : "Ask"}
            </Button>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={planWeek} loading={planning}>
              <CalendarRange className="size-3.5 text-accent" /> Plan 3 days
            </Button>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={startVote} loading={starting}>
              <Dices className="size-3.5 text-accent" /> Vote
            </Button>
          </div>

          <form onSubmit={send} className="px-4 py-3 flex gap-2">
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
      </div>
    </>
  );
}
