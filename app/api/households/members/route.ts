import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { householdMembers, users, profiles } from "@/lib/db/schema";
import { requireContext, handler, json } from "@/lib/api";
import { computeTargets, type Sex } from "@/lib/nutrition";

/** Everyone in the flat, with their calorie/macro targets so the UI can show who is covered. */
export const GET = handler(async () => {
  const { household } = await requireContext();

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      emoji: users.emoji,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
      sex: profiles.sex,
      age: profiles.age,
      heightCm: profiles.heightCm,
      weightKg: profiles.weightKg,
      activityLevel: profiles.activityLevel,
      goal: profiles.goal,
      diet: profiles.diet,
      allergies: profiles.allergies,
      dislikes: profiles.dislikes,
      calorieOverride: profiles.calorieOverride,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(householdMembers.householdId, household.id));

  const members = rows.map((r) => {
    const targets = computeTargets({
      sex: (r.sex ?? null) as Sex | null,
      age: r.age,
      heightCm: r.heightCm ? Number(r.heightCm) : null,
      weightKg: r.weightKg ? Number(r.weightKg) : null,
      activityLevel: r.activityLevel ?? "light",
      goal: r.goal ?? "maintain",
      calorieOverride: r.calorieOverride,
    });
    return {
      userId: r.userId,
      name: r.name,
      emoji: r.emoji,
      role: r.role,
      diet: r.diet ?? "veg",
      goal: r.goal ?? "maintain",
      allergies: r.allergies ?? [],
      dislikes: r.dislikes ?? [],
      hasProfile: Boolean(r.age && r.heightCm && r.weightKg) || Boolean(r.calorieOverride),
      targets,
    };
  });

  return json({ household, members });
});
