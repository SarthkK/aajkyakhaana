"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Input, Field, ErrorNote, cx } from "@/components/ui";

export function WelcomeScreen({ name }: { name: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [flatName, setFlatName] = useState("");
  const [cookName, setCookName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === "create") {
        await api.post("/api/households", { name: flatName, cookName: cookName || null });
      } else {
        await api.post("/api/households/join", { code });
      }
      router.replace("/today");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto w-full">
      <div className="mb-7">
        <div className="text-5xl mb-3">🏠</div>
        <h1 className="text-3xl font-bold tracking-tight">Hi {name.split(" ")[0]}!</h1>
        <p className="text-muted mt-2 leading-relaxed">
          Kya Khaana works per flat. Start one for your place, or join the one your flatmates already made.
        </p>
      </div>

      <div className="flex gap-2 p-1 bg-surface-2 rounded-2xl mb-5">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={cx(
              "flex-1 h-10 rounded-xl text-sm font-medium transition",
              tab === t ? "bg-surface text-ink shadow-sm" : "text-muted",
            )}
          >
            {t === "create" ? "Start a flat" : "Join with code"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {tab === "create" ? (
          <>
            <Field label="Flat name">
              <Input
                value={flatName}
                onChange={(e) => setFlatName(e.target.value)}
                placeholder="302, Sunshine Apartments"
                required
              />
            </Field>
            <Field label="Cook's name" hint="Optional — so the plan says who is cooking.">
              <Input value={cookName} onChange={(e) => setCookName(e.target.value)} placeholder="Sunita ji" />
            </Field>
          </>
        ) : (
          <Field label="Flat code" hint="Six characters, from whoever set up the flat.">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="KHA4R2"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="text-center text-2xl tracking-[0.3em] font-semibold"
              maxLength={8}
              required
            />
          </Field>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {tab === "create" ? "Create flat" : "Join flat"}
        </Button>
      </form>
    </main>
  );
}
