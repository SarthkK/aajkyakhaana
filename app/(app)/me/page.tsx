"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Users } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import {
  Button,
  Input,
  Field,
  Segmented,
  Select,
  Card,
  ErrorNote,
  Avatar,
  cx,
} from "@/components/ui";
import { ProfileSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/SessionProvider";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  MACRO_KEYS,
} from "@/lib/nutrition";
import type { MemberView, Targets } from "@/lib/types";

const EMOJIS = [
  "🙂",
  "😎",
  "🦁",
  "🐯",
  "🐼",
  "🦊",
  "🐨",
  "🐵",
  "🦉",
  "🐸",
  "🍕",
  "🌶️",
  "🥑",
  "☕",
];

type ProfileResponse = {
  user: { id: string; name: string; email: string; emoji: string };
  profile: {
    sex: string | null;
    age: number | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: string;
    goal: string;
    diet: string;
    allergies: string[];
    dislikes: string[];
    calorieOverride: number | null;
  } | null;
  targets: Targets | null;
};

export default function MePage() {
  const { data, loading, error, reload } =
    useApi<ProfileResponse>("/api/profile");
  const members = useApi<{ members: MemberView[] }>("/api/households/members");

  if (loading && !data) {
    return (
      <>
        <AppHeader title="You & your flat" />
        <div className="px-4 pt-4">
          <ProfileSkeleton />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <AppHeader title="You & your flat" />
        <div className="p-4">
          <ErrorNote>{error ?? "Could not load your profile"}</ErrorNote>
        </div>
      </>
    );
  }

  return (
    <MeForm
      key={data.user.id}
      data={data}
      reload={reload}
      members={members.data?.members ?? []}
      reloadMembers={members.reload}
    />
  );
}

function MeForm({
  data,
  reload,
  members,
  reloadMembers,
}: {
  data: ProfileResponse;
  reload: () => Promise<void>;
  members: MemberView[];
  reloadMembers: () => Promise<void>;
}) {
  const router = useRouter();
  const { household } = useSession();
  const toast = useToast();

  // Seeded once from the server copy; this component remounts if the user changes.
  const [form, setForm] = useState({
    name: data.user.name,
    emoji: data.user.emoji,
    sex: data.profile?.sex ?? "",
    age: data.profile?.age != null ? String(data.profile.age) : "",
    heightCm:
      data.profile?.heightCm != null ? String(data.profile.heightCm) : "",
    weightKg:
      data.profile?.weightKg != null ? String(data.profile.weightKg) : "",
    activityLevel: data.profile?.activityLevel ?? "light",
    goal: data.profile?.goal ?? "maintain",
    diet: data.profile?.diet ?? "veg",
    allergies: (data.profile?.allergies ?? []).join(", "),
    dislikes: (data.profile?.dislikes ?? []).join(", "),
  });
  const [targets, setTargets] = useState(data.targets);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      await api.put("/api/profile", {
        name: form.name,
        emoji: form.emoji,
        sex: form.sex || null,
        age: form.age === "" ? null : Number(form.age),
        heightCm: form.heightCm === "" ? null : Number(form.heightCm),
        weightKg: form.weightKg === "" ? null : Number(form.weightKg),
        activityLevel: form.activityLevel,
        goal: form.goal,
        diet: form.diet,
        allergies: splitList(form.allergies),
        dislikes: splitList(form.dislikes),
      });
      const fresh = await api.get<ProfileResponse>("/api/profile");
      setTargets(fresh.targets);
      void reload();
      void reloadMembers();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast(
        fresh.targets
          ? `Saved — ${fresh.targets.calories} kcal and ${fresh.targets.protein_g}g protein a day`
          : "Saved",
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
      toast("Could not save that", { tone: "bad" });
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(`Code ${household.code} copied — send it to your flatmates`, { tone: "info" });
    } catch {
      setProblem("Could not copy — the code is " + household.code);
    }
  }

  async function share() {
    const text = `Join our flat on Kya Khaana with code ${household.code} — ${location.origin}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Kya Khaana", text });
        return;
      } catch {
        // cancelled — fall through to copying
      }
    }
    void copyCode();
  }

  return (
    <>
      <AppHeader
        title="You & your flat"
        action={
          <Button size="sm" onClick={save} loading={saving}>
            {saved && <Check className="size-4" />}
            {saved ? "Saved" : "Save"}
          </Button>
        }
      />

      <div className="px-4 pt-4 space-y-5">
        {problem && <ErrorNote>{problem}</ErrorNote>}

        <Card className="p-4 space-y-4">
          <Field label="Your name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <div>
            <span className="block text-sm font-medium mb-1.5">Your face</span>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setForm({ ...form, emoji: e })}
                  className={cx(
                    "size-10 rounded-xl border text-lg transition",
                    form.emoji === e
                      ? "bg-accent-soft border-accent"
                      : "bg-surface-2 border-line",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
            What you eat
          </h2>
          <Card className="p-4 space-y-4">
            <Field label="Diet">
              <Segmented
                value={form.diet}
                onChange={(v) => setForm({ ...form, diet: v })}
                options={[
                  { value: "veg", label: "Veg" },
                  { value: "egg", label: "Eggetarian" },
                  { value: "nonveg", label: "Non-veg" },
                  { value: "vegan", label: "Vegan" },
                  { value: "jain", label: "Jain" },
                ]}
              />
            </Field>

            <Field
              label="Allergies"
              hint="Comma separated. The AI will never suggest these."
            >
              <Input
                value={form.allergies}
                onChange={(e) =>
                  setForm({ ...form, allergies: e.target.value })
                }
                placeholder="peanuts, prawns"
              />
            </Field>

            <Field
              label="Things you'd rather not eat"
              hint="Comma separated. Used as a soft preference."
            >
              <Input
                value={form.dislikes}
                onChange={(e) => setForm({ ...form, dislikes: e.target.value })}
                placeholder="karela, lauki"
              />
            </Field>
          </Card>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
            Your numbers
          </h2>
          <Card className="p-4 space-y-4">
            <p className="text-xs text-muted leading-relaxed -mt-1">
              Used to work out your daily calorie and protein targets, and to
              steer what the AI suggests.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Age">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  placeholder="24"
                  className="py-2"
                />
              </Field>
              <Field label="Height">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.heightCm}
                  onChange={(e) =>
                    setForm({ ...form, heightCm: e.target.value })
                  }
                  placeholder="175"
                  className="py-2"
                />
              </Field>
              <Field label="Weight">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.weightKg}
                  onChange={(e) =>
                    setForm({ ...form, weightKg: e.target.value })
                  }
                  placeholder="70"
                  className="py-2"
                />
              </Field>
            </div>
            <p className="text-xs text-muted -mt-2">
              Height in cm, weight in kg.
            </p>

            <Field
              label="Sex"
              hint="Changes the calorie formula and some nutrient targets."
            >
              <Segmented
                value={form.sex}
                onChange={(v) => setForm({ ...form, sex: v })}
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                  { value: "other", label: "Prefer not to say" },
                ]}
              />
            </Field>

            <Field label="How active are you?">
              <Select
                value={form.activityLevel}
                onChange={(e) =>
                  setForm({ ...form, activityLevel: e.target.value })
                }
              >
                {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Goal">
              <Segmented
                value={form.goal}
                onChange={(v) => setForm({ ...form, goal: v })}
                options={Object.entries(GOAL_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Field>

            {targets && (
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  Your daily targets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MACRO_KEYS.map((key) => (
                    <span
                      key={key}
                      className="text-[11px] px-2 py-1 rounded-lg bg-surface border border-line"
                    >
                      <span className="text-muted">
                        {NUTRIENT_LABELS[key]}{" "}
                      </span>
                      <span className="font-semibold">
                        {Math.round(targets[key])}
                        {NUTRIENT_UNITS[key]}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
            Your flat
          </h2>
          <Card className="p-4 space-y-4">
            <div>
              <p className="font-semibold">{household.name}</p>
              {household.cookName && (
                <p className="text-sm text-muted">Cook: {household.cookName}</p>
              )}
            </div>

            <div className="rounded-2xl bg-accent-soft border border-accent/30 p-3.5">
              <p className="text-xs text-accent-text font-medium mb-1">
                Flat code
              </p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tracking-[0.2em] flex-1">
                  {household.code}
                </span>
                <Button size="sm" variant="secondary" onClick={copyCode}>
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted mt-2">
                Share this so your flatmates can join.
              </p>
              <Button size="sm" className="mt-2.5 w-full" onClick={share}>
                <Users className="size-4" /> Invite flatmates
              </Button>
            </div>

            {members.length > 0 && (
              <ul className="space-y-2.5">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3">
                    <Avatar emoji={m.emoji} name={m.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {m.name}
                        {m.userId === data.user.id && (
                          <span className="text-muted font-normal"> (you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {m.diet}
                        {m.targets
                          ? ` · ${m.targets.calories} kcal/day`
                          : " · no numbers yet"}
                        {m.allergies.length
                          ? ` · avoids ${m.allergies.join(", ")}`
                          : ""}
                      </p>
                    </div>
                    {m.role === "owner" && (
                      <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">
                        Owner
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <Button variant="secondary" className="w-full" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>

        <p className="text-center text-xs text-muted">
          Signed in as {data.user.email}
        </p>

        <div className="h-4" />
      </div>
    </>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}
