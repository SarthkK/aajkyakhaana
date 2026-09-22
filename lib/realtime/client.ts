"use client";

import Ably from "ably";
import { logClient } from "@/lib/log-client";

/**
 * Connects the browser to its flat's channel, if realtime is switched on.
 *
 * Returns a teardown function, or null when realtime is unavailable — which the caller
 * treats as "keep polling". Everything degrades: no credentials, a failed handshake, a
 * blocked websocket on some café wifi, all end up back on the 3-second timer rather
 * than a broken chat.
 */
export type RealtimeHandle = {
  close: () => void;
};

export async function connectRealtime(
  handlers: Record<string, (data: Record<string, unknown>) => void>,
): Promise<RealtimeHandle | null> {
  try {
    const res = await fetch("/api/realtime/token");
    if (!res.ok) return null;

    const token = await res.json();
    if (token?.realtime === false) return null;

    const client = new Ably.Realtime({
      // Ably calls this whenever it needs a fresh token, so a long session never drops.
      authCallback: (_params, callback) => {
        fetch("/api/realtime/token")
          .then((r) => r.json())
          .then((t) => callback(null, t))
          .catch((err) => callback(err as string, null));
      },
      // The browser is a listener; nothing here needs to survive a reload.
      echoMessages: false,
    });

    const channelName = token.capability
      ? Object.keys(JSON.parse(token.capability))[0]
      : null;
    if (!channelName) {
      client.close();
      return null;
    }

    const channel = client.channels.get(channelName);
    for (const [event, handler] of Object.entries(handlers)) {
      await channel.subscribe(event, (message) => {
        handler((message.data ?? {}) as Record<string, unknown>);
      });
    }

    logClient.info("realtime connected", channelName);
    return {
      close: () => {
        try {
          channel.unsubscribe();
          client.close();
        } catch {
          // Already gone.
        }
      },
    };
  } catch (err) {
    logClient.warn("realtime unavailable, falling back to polling", err);
    return null;
  }
}
