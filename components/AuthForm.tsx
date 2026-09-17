"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Input, Field, ErrorNote } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(isSignup ? "/api/auth/signup" : "/api/auth/login", { name, email, password });
      // Full navigation so the server re-reads the new session cookie.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto w-full">
      <div className="mb-8">
        <div className="text-5xl mb-3">🍲</div>
        <h1 className="text-3xl font-bold tracking-tight">Kya Khaana</h1>
        <p className="text-muted mt-2 leading-relaxed">
          {isSignup
            ? "Sort out what your flat is eating this week — without the daily group-chat debate."
            : "Welcome back. What are we eating today?"}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {isSignup && (
          <Field label="Your name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarthak"
              autoComplete="name"
              required
            />
          </Field>
        )}

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            required
          />
        </Field>

        <Field label="Password" hint={isSignup ? "At least 8 characters." : undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {isSignup ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted mt-6">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link href={isSignup ? "/login" : "/signup"} className="text-accent-text font-medium">
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}
