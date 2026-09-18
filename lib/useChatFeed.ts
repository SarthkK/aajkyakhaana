"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { logClient } from "@/lib/log-client";
import type { FeedMessage } from "@/lib/types";

/**
 * Keeps the flat's feed current without a persistent connection.
 *
 * Three rules, all of them about not keeping a free-tier database awake for nothing:
 *
 *  1. Poll a cursor, not the feed. The common answer is "still 412", which is one
 *     indexed read; the content is only fetched when that number actually moves.
 *  2. Only while the tab is visible. A phone in a pocket polls nothing.
 *  3. Stop after five idle minutes. A tab left open on a laptop overnight would
 *     otherwise hold the database awake till morning — which is the real cost risk,
 *     far more than how often we poll.
 */
const POLL_MS = 3_000;
const IDLE_AFTER_MS = 5 * 60_000;

export function useChatFeed() {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  const cursor = useRef(0);
  const inFlight = useRef(false);
  const lastActivity = useRef(0);
  const alive = useRef(true);

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
      return added.length ? [...prev, ...added] : prev;
    });
    cursor.current = Math.max(cursor.current, ...incoming.map((m) => m.id));
  }, []);

  /** First load: the most recent page. */
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

  /** One tick: ask the cheap question, and only fetch content if the answer changed. */
  const tick = useCallback(async () => {
    if (inFlight.current || document.hidden) return;

    if (Date.now() - lastActivity.current > IDLE_AFTER_MS) {
      setLive(false);
      return;
    }

    inFlight.current = true;
    try {
      const { latest } = await api.get<{ latest: number }>("/api/chat/cursor");
      if (!alive.current || latest <= cursor.current) return;

      const res = await api.get<{ messages: FeedMessage[] }>(`/api/chat?after=${cursor.current}`);
      if (alive.current) merge(res.messages);
    } catch (err) {
      logClient.warn("chat poll failed", err);
    } finally {
      inFlight.current = false;
    }
  }, [merge]);

  useEffect(() => {
    lastActivity.current = Date.now();
    void load();

    const wake = () => {
      lastActivity.current = Date.now();
      if (!document.hidden) {
        setLive(true);
        void tick();
      }
    };

    const timer = setInterval(() => void tick(), POLL_MS);
    // Any sign of life restarts polling and resets the idle clock.
    for (const event of ["pointerdown", "keydown", "focus", "visibilitychange"]) {
      window.addEventListener(event, wake);
    }

    return () => {
      clearInterval(timer);
      for (const event of ["pointerdown", "keydown", "focus", "visibilitychange"]) {
        window.removeEventListener(event, wake);
      }
    };
  }, [tick, load]);

  /** Optimistically append a message the person just sent. */
  const append = useCallback(
    (message: FeedMessage) => {
      merge([message]);
    },
    [merge],
  );

  return { messages, loading, error, live, append, reload: load };
}
