"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { cx } from "@/components/ui";

type Tone = "good" | "bad" | "info";
type Toast = { id: number; message: string; tone: Tone; action?: { label: string; onClick: () => void } };

const ToastContext = createContext<{
  show: (message: string, opts?: { tone?: Tone; action?: Toast["action"] }) => void;
} | null>(null);

/** Short confirmations, so an action never leaves you wondering whether it worked. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx.show;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback(
    (message: string, opts?: { tone?: Tone; action?: Toast["action"] }) => {
      const id = nextId++;
      // Only ever one on screen; a stack of these on a phone is just noise.
      setToasts([{ id, message, tone: opts?.tone ?? "good", action: opts?.action }]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        aria-live="polite"
        role="status"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDone={() => setToasts((t) => t.filter((x) => x.id !== toast.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS: Record<Tone, typeof Check> = { good: Check, bad: TriangleAlert, info: Info };

function ToastRow({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    // Errors and anything with an action stay long enough to actually be used.
    const ms = toast.tone === "bad" || toast.action ? 6000 : 2800;
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  const Icon = ICONS[toast.tone];

  return (
    <div
      className={cx(
        "pointer-events-auto w-full max-w-md flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-lg animate-toast border",
        toast.tone === "bad"
          ? "bg-bad-soft border-bad/30 text-bad"
          : toast.tone === "info"
            ? "bg-surface border-line text-ink"
            : "bg-good-soft border-good/30 text-good",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="text-sm font-medium flex-1 leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDone();
          }}
          className="text-sm font-semibold underline underline-offset-2 shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={onDone} className="shrink-0 opacity-60 p-1 -mr-1" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
