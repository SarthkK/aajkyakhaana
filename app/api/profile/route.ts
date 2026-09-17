import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { requireUserId, handler, json } from "@/lib/api";
import { computeTargets, type Sex } from "@/lib/nutrition";

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  emoji: z.string().trim().min(1).max(8).optional(),
  sex: z.enum(["male", "female", "other"]).nullable().optional(),
  age: z.coerce.number().int().min(10).max(100).nullable().optional(),
  heightCm: z.coerce.number().min(100).max(250).nullable().optional(),
  weightKg: z.coerce.number().min(25).max(300).nullable().optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
  goal: z.enum(["lose", "maintain", "gain"]).optional(),
  diet: z.enum(["veg", "egg", "nonveg", "vegan", "jain"]).optional(),
  allergies: z.array(z.string().trim().max(40)).max(20).optional(),
  dislikes: z.array(z.string().trim().max(40)).max(20).optional(),
  calorieOverride: z.coerce.number().int().min(800).max(6000).nullable().optional(),
});

async function load(userId: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, emoji: users.emoji })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

  const targets = profile
    ? computeTargets({
        sex: (profile.sex ?? null) as Sex | null,
        age: profile.age,
        heightCm: profile.heightCm ? Number(profile.heightCm) : null,
        weightKg: profile.weightKg ? Number(profile.weightKg) : null,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        calorieOverride: profile.calorieOverride,
      })
    : null;

  return {
    user,
    profile: profile
      ? {
          ...profile,
          heightCm: profile.heightCm ? Number(profile.heightCm) : null,
          weightKg: profile.weightKg ? Number(profile.weightKg) : null,
        }
      : null,
    targets,
  };
}

export const GET = handler(async () => {
  const userId = await requireUserId();
  return json(await load(userId));
});

export const PUT = handler(async (req: Request) => {
  const userId = await requireUserId();
  const input = schema.parse(await req.json());

  const { name, emoji, ...profileFields } = input;
  if (name !== undefined || emoji !== undefined) {
    await db
      .update(users)
      .set({ ...(name !== undefined ? { name } : {}), ...(emoji !== undefined ? { emoji } : {}) })
      .where(eq(users.id, userId));
  }

  if (Object.keys(profileFields).length > 0) {
    const values = {
      ...profileFields,
      heightCm: profileFields.heightCm != null ? String(profileFields.heightCm) : profileFields.heightCm,
      weightKg: profileFields.weightKg != null ? String(profileFields.weightKg) : profileFields.weightKg,
      updatedAt: new Date(),
    };
    await db
      .insert(profiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values });
  }

  return json(await load(userId));
});
