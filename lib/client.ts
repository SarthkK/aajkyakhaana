"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new HttpError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Minimal data hook: fetch on mount, expose a refetch, never set state after unmount.
 * To force a refetch when the path has not changed, give the component a new `key`
 * so it remounts.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const alive = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!path) return;

    // Tag each request so a slow earlier response cannot overwrite a newer one.
    const ticket = ++latest.current;
    const settle = (fn: () => void) => {
      if (alive.current && ticket === latest.current) fn();
    };

    settle(() => setLoading(true));
    try {
      const result = await api.get<T>(path);
      settle(() => {
        setData(result);
        setError(null);
      });
    } catch (err) {
      settle(() => setError(err instanceof Error ? err.message : "Could not load"));
    } finally {
      settle(() => setLoading(false));
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
