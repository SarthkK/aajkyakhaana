"use client";

import { useCallback } from "react";
import useSWR, { preload, mutate as globalMutate } from "swr";

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
 * Data hook backed by SWR, keeping the same shape the app already uses.
 *
 * The important behaviours for this app:
 * - cached per URL, so going back to a tab renders instantly from memory and
 *   revalidates in the background instead of showing a spinner again;
 * - `keepPreviousData` holds the old screen in place while a new URL loads, which
 *   is what stops the layout jumping when you page between days;
 * - identical requests fired at the same moment are deduped into one.
 */
export function useApi<T>(path: string | null) {
  const { data, error, isLoading, mutate } = useSWR<T>(path, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: true,
    // The plan changes when a flatmate votes, but not second to second.
    dedupingInterval: 4000,
    errorRetryCount: 2,
  });

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  /** Optimistic local update; pass a value or an updater, same as useState. */
  const setData = useCallback(
    (next: T | null | ((prev: T | null) => T | null)) => {
      void mutate(
        (prev) => {
          const resolved =
            typeof next === "function" ? (next as (p: T | null) => T | null)(prev ?? null) : next;
          return resolved ?? undefined;
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  return {
    data: data ?? null,
    error: error instanceof Error ? error.message : null,
    // Only a first load counts as loading; a background revalidation must not
    // swap a rendered screen back to a skeleton.
    loading: isLoading && data === undefined,
    reload,
    setData,
  };
}

const fetcher = <T,>(path: string) => api.get<T>(path);

/**
 * Warms the cache for a URL before anything renders it. Used to load the other
 * tabs while the person is still reading the current one, so switching is instant.
 */
export function prefetch(path: string) {
  return preload(path, fetcher);
}

/** Drops cached responses whose URL matches, so the next render refetches. */
export function invalidate(match: (path: string) => boolean) {
  return globalMutate((key) => typeof key === "string" && match(key), undefined, {
    revalidate: true,
  });
}
