"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { logClient } from "@/lib/log-client";
import { connectRealtime, type RealtimeHandle } from "@/lib/realtime/client";
import type { FeedMessage } from "@/lib/types";

/**
 * Keeps the flat's feed current.
 *
 * Realtime when it is available: the server nudges "the feed moved to cursor N" and the
 * client fetches what is new. The nudge carries no content, so nothing anyone writes
 * passes through a third party, and it replaces only the timer — every fetch path below
 * is the same one polling used.
 *
 * Polling when it is not, on three rules that keep a free-tier database cheap:
 *  1. Poll a cursor, not the feed. The usual answer is "still 412", one indexed read.
 *  2. Stop while the tab is hidden.
 *  3. Stop after five idle minutes — a tab left open overnight, not the interval, is
 *     what would actually exhaust the compute budget.
 *
 * A slow heartbeat runs even on realtime, because a dropped nudge should cost you a few
 * seconds rather than leaving the chat silently stale.
 */
const POLL_MS = 3_000;
const HEARTBEAT_MS = 30_000;
const IDLE_AFTER_MS = 5 * 60_000;
/** How long "Kitchen AI is thinking" stays up if no reply arrives. */
const THINKING_TIMEOUT_MS = 45_000;

export function useChatFeed() {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [realtime, setRealtime] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);

  const cursor = useRef(0);
  const inFlight = useRef(false);
  const lastActivity = useRef(0);
  const alive = useRef(true);
  const realtimeRef = useRef(false);
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const merge = useCallback((incoming: FeedMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      // A poll's tally can change without its id changing, so refresh what we already hold.
      const updated = prev.map((existing) => incoming.find((m) => m.id === existing.id) ?? existing);
      return added.length ? [...updated, ...added] : updated;
    });
    cursor.current = Math.max(cursor.current, ...incoming.map((m) => m.id));
    // Anything arriving means the assistant is no longer mid-thought.
    setAssistantThinking(false);
  }, []);

  const load = useCallback(
    () =>
      api
        .get<{ messages: FeedMessage[]; latest: number }>("/api/chat")
        .then((res) => {
          if (!alive.current) return;
          setMessages(res.messages);
          cursor.current = res.latest;
          setError(null);
        })
        .catch((err: unknown) => {
          if (alive.current) setError(err instanceof Error ? err.message : "Could not load the chat");
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        }),
    [],
  );

  /** Pulls anything newer than the cursor. Shared by the nudge and the timer. */
  const pull = useCallback(
    async (knownCursor?: number) => {
      if (inFlight.current) return;
      if (knownCursor !== undefined && knownCursor <= cursor.current) return;

      inFlight.current = true;
      try {
        const res = await api.get<{ messages: FeedMessage[] }>(`/api/chat?after=${cursor.current}`);
        if (alive.current) merge(res.messages);
      } catch (err) {
        logClient.warn("chat refresh failed", err);
      } finally {
        inFlight.current = false;
      }
    },
    [merge],
  );

  /** One timer tick: ask the cheap question, fetch only if the answer moved. */
  const tick = useCallback(async () => {
    if (inFlight.current || document.hidden) return;

    // On realtime the timer is only a safety net, so the idle rule does not apply.
    if (!realtimeRef.current && Date.now() - lastActivity.current > IDLE_AFTER_MS) {
      setLive(false);
      return;
    }

    try {
      const { latest } = await api.get<{ latest: number }>("/api/chat/cursor");
      if (latest > cursor.current) await pull(latest);
    } catch (err) {
      logClient.warn("chat poll failed", err);
    }
  }, [pull]);

  useEffect(() => {
    lastActivity.current = Date.now();
    void load();

    let handle: RealtimeHandle | null = null;
    let cancelled = false;

    void connectRealtime({
      feed: (data) => {
        // A new message carries its cursor, so only the new part is fetched. A vote or
        // a poll being settled changes a row already on screen without moving the
        // cursor, so there is nothing newer to ask for — that needs a full refresh.
        if (typeof data.cursor === "number") void pull(data.cursor);
        else void load();
      },
      thinking: () => {
        setAssistantThinking(true);
        clearTimeout(thinkingTimer.current);
        thinkingTimer.current = setTimeout(() => setAssistantThinking(false), THINKING_TIMEOUT_MS);
      },
    }).then((connected) => {
      if (cancelled) {
        connected?.close();
        return;
      }
      handle = connected;
      realtimeRef.current = Boolean(connected);
      setRealtime(Boolean(connected));
      if (connected) setLive(true);
    });

    const wake = () => {
      lastActivity.current = Date.now();
      if (!document.hidden) {
        setLive(true);
        void tick();
      }
    };

    // Fast timer only when realtime is not carrying the load.
    const timer = setInterval(() => {
      if (realtimeRef.current) return;
      void tick();
    }, POLL_MS);

    // Slow heartbeat always, so a dropped nudge costs seconds rather than silence.
    const heartbeat = setInterval(() => {
      if (realtimeRef.current && !document.hidden) void tick();
    }, HEARTBEAT_MS);

    for (const event of ["pointerdown", "keydown", "focus", "visibilitychange"]) {
      window.addEventListener(event, wake);
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      clearTimeout(thinkingTimer.current);
      handle?.close();
      for (const event of ["pointerdown", "keydown", "focus", "visibilitychange"]) {
        window.removeEventListener(event, wake);
      }
    };
  }, [tick, load, pull]);

  const append = useCallback((message: FeedMessage) => merge([message]), [merge]);

  return { messages, loading, error, live, realtime, assistantThinking, append, reload: load };
}
