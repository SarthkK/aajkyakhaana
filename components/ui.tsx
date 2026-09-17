"use client";

import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- button --------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const VARIANTS = {
  primary: "bg-accent text-white active:brightness-90 disabled:opacity-50",
  secondary: "bg-surface-2 text-ink border border-line active:bg-line disabled:opacity-50",
  ghost: "text-muted active:bg-surface-2 disabled:opacity-50",
  danger: "bg-bad-soft text-bad border border-bad/30 active:brightness-95 disabled:opacity-50",
};

const SIZES = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-4 text-[15px] rounded-2xl",
  lg: "h-13 px-5 text-base rounded-2xl",
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-medium select-none pressable",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------------------------- card ---------------------------------- */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("bg-surface border border-line rounded-3xl", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

/* --------------------------------- inputs --------------------------------- */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1.5">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full bg-surface border border-line rounded-2xl px-4 py-3 outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20 transition";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputBase, className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputBase, "resize-none", className)} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputBase, "appearance-none pr-10", className)}>
      {children}
    </select>
  );
}

/** Horizontal pill picker — much easier to tap than a dropdown on a phone. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 px-3.5 h-9 rounded-full text-sm font-medium border pressable",
            value === o.value
              ? "bg-accent text-white border-accent"
              : "bg-surface text-muted border-line active:bg-surface-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- sheet --------------------------------- */

/** Bottom sheet — the phone-native way to show a form over the current screen. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-bg rounded-t-3xl animate-sheet max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div
          className="px-5 pb-5 overflow-y-auto"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- misc ---------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="font-medium">{title}</p>
      {body && <p className="text-sm text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-bad bg-bad-soft border border-bad/20 rounded-2xl px-4 py-3">{children}</p>
  );
}

export function Avatar({ emoji, name, size = "md" }: { emoji?: string | null; name?: string | null; size?: "sm" | "md" }) {
  return (
    <span
      title={name ?? undefined}
      className={cx(
        "inline-flex items-center justify-center rounded-full bg-surface-2 border border-line shrink-0",
        size === "sm" ? "size-6 text-xs" : "size-8 text-sm",
      )}
    >
      {emoji || (name ? name[0]?.toUpperCase() : "?")}
    </span>
  );
}
